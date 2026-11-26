import { quotationCopy } from "@/lib/quotation-copy";
import type { InvoicePdfInput } from "@/lib/invoice-pdf";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  formatPercentBps,
  invoiceLineDetail,
  invoiceLineQuantity,
} from "@/lib/invoice-money";
import { pdfQuantityHeader } from "@/lib/invoice-document";
import { utcDateKey } from "@/lib/rates";

export function toQuotationPdfInput(input: {
  companyName: string;
  companyAddress: string;
  number: string;
  clientName: string;
  clientAddress: string;
  currency: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  terms: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: Array<{
    title: string;
    detail: string;
    quantitySeconds: number;
    quantityMs?: bigint | string | null;
    quantityKind?: string | null;
    rangeStart?: Date | string | null;
    rangeEnd?: Date | string | null;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
}): InvoicePdfInput {
  const money = (amount: number) => formatInvoiceMoney(amount, input.currency);
  const totals: InvoicePdfInput["totals"] = [{ label: quotationCopy.subtotal, value: money(input.subtotalMinor) }];
  if (input.taxEnabled) {
    totals.push({
      label: `${input.taxLabel} (${formatPercentBps(input.taxRateBps)})`,
      value: money(input.taxMinor),
    });
  }
  totals.push({ label: quotationCopy.total, value: money(input.totalMinor), emphasize: true });
  return {
    number: input.number,
    heading: `${quotationCopy.documentTitle} ${input.number}`,
    headingBoldPrefix: quotationCopy.documentTitle,
    dueLabel: `${quotationCopy.validUntil}:`,
    quantityHeader: pdfQuantityHeader(input.lines),
    companyName: input.companyName,
    companyAddress: input.companyAddress,
    clientName: input.clientName,
    clientAddress: input.clientAddress,
    issueDate: formatInvoiceDate(input.issueDate),
    dueDate: formatInvoiceDate(input.validUntil),
    poNumber: null,
    notes: input.notes,
    terms: input.terms,
    bankDetails: "",
    lines: input.lines.map((line) => ({
      title: line.title,
      description: line.detail,
      detail: invoiceLineDetail({
        detail: "",
        rangeStart: dateKey(line.rangeStart),
        rangeEnd: dateKey(line.rangeEnd),
      }),
      quantity: invoiceLineQuantity(line),
      unitPrice: money(line.unitPriceMinor),
      amount: money(line.amountMinor),
    })),
    totals,
  };
}

function dateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? utcDateKey(value) : value;
}
