import { isOverdue } from "@/lib/invoice-balance";
import { invoiceCopy } from "@/lib/invoice-copy";
import { amountDueMinor } from "@/lib/invoice-money";
import { findPublicInvoice, publicInvoiceHeaders, takePublicInvoiceRead } from "@/lib/invoice-public";
import { renderStoredInvoicePdf } from "@/lib/invoice-render";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { requestIp } from "@/lib/request-headers";
import { utcDateKey } from "@/lib/rates";
import { todayInTimeZone } from "@/lib/time-zone";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const slot = await takePublicInvoiceRead(await requestIp());
  if (slot.limited) {
    const seconds = Math.max(1, Math.ceil((slot.retryAfterMs ?? 60_000) / 1000));
    return new Response(invoiceCopy.publicLimited, {
      status: 429,
      headers: publicInvoiceHeaders({ "Retry-After": String(seconds) }),
    });
  }
  const invoice = await findPublicInvoice((await context.params).token);
  if (!invoice) return new Response("Not found", { status: 404, headers: publicInvoiceHeaders() });
  const settings = await getInvoiceSettings();
  const pdf = await renderStoredInvoicePdf({
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    ...invoice,
    overdue: isOverdue({
      dueDate: utcDateKey(invoice.dueDate),
      today: todayInTimeZone(settings.timeZone),
      dueMinor: amountDueMinor(invoice.totalMinor, invoice.paidMinor),
    }),
  });
  return new Response(new Uint8Array(pdf), {
    headers: publicInvoiceHeaders({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.number}.pdf"`,
    }),
  });
}
