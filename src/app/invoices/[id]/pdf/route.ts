import { toInvoicePdfInput } from "@/lib/invoice-document";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { getInvoice } from "@/lib/invoices";
import { utcDateKey } from "@/lib/rates";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canManageWorkspace(user.role)) return new Response("Forbidden", { status: 403 });
  const { id } = await context.params;
  const invoice = await getInvoice(user.role, id);
  if (!invoice) return new Response("Not found", { status: 404 });
  const settings = await getInvoiceSettings();
  const address = invoice.client.billingAddress?.trim() || invoice.client.address?.trim() || "";
  const pdf = await renderInvoicePdf(
    toInvoicePdfInput({
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      number: invoice.number,
      clientName: invoice.client.name,
      clientAddress: address,
      currency: invoice.currency,
      issueDate: utcDateKey(invoice.issueDate),
      dueDate: utcDateKey(invoice.dueDate),
      poNumber: invoice.poNumber,
      notes: invoice.notes,
      bankDetails: invoice.bankDetails,
      discountMinor: invoice.discountMinor,
      discountKind: invoice.discountKind,
      discountBps: invoice.discountBps,
      taxEnabled: invoice.taxEnabled,
      taxLabel: invoice.taxLabel,
      taxRateBps: invoice.taxRateBps,
      subtotalMinor: invoice.subtotalMinor,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      lines: invoice.lines.map((line) => ({
        title: line.title,
        detail: line.detail,
        quantitySeconds: line.quantitySeconds,
        unitPriceMinor: line.unitPriceMinor,
        amountMinor: line.amountMinor,
      })),
    }),
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
