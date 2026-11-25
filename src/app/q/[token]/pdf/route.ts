import { publicInvoiceHeaders } from "@/lib/invoice-public";
import { quotationCopy } from "@/lib/quotation-copy";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { toQuotationPdfInput } from "@/lib/quotation-document";
import { findPublicQuotation, takePublicQuotationRead } from "@/lib/quotation-public";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { requestIp } from "@/lib/request-headers";
import { utcDateKey } from "@/lib/rates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const slot = await takePublicQuotationRead(await requestIp());
  if (slot.limited) {
    const seconds = Math.max(1, Math.ceil((slot.retryAfterMs ?? 60_000) / 1000));
    return new Response(quotationCopy.publicLimited, {
      status: 429,
      headers: publicInvoiceHeaders({ "Retry-After": String(seconds) }),
    });
  }
  const quotation = await findPublicQuotation((await context.params).token);
  if (!quotation) return new Response("Not found", { status: 404, headers: publicInvoiceHeaders() });
  const settings = await getInvoiceSettings();
  const pdf = await renderInvoicePdf(
    toQuotationPdfInput({
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      number: quotation.number,
      clientName: quotation.clientName,
      clientAddress: quotation.clientAddress,
      currency: quotation.currency,
      issueDate: utcDateKey(quotation.issueDate),
      validUntil: utcDateKey(quotation.validUntil),
      notes: quotation.notes,
      terms: quotation.terms,
      taxEnabled: quotation.taxEnabled,
      taxLabel: quotation.taxLabel,
      taxRateBps: quotation.taxRateBps,
      subtotalMinor: quotation.subtotalMinor,
      taxMinor: quotation.taxMinor,
      totalMinor: quotation.totalMinor,
      lines: quotation.lines,
    }),
  );
  return new Response(new Uint8Array(pdf), {
    headers: publicInvoiceHeaders({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Quotation-${quotation.number}.pdf"`,
    }),
  });
}
