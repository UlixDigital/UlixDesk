import { invoiceCopy } from "@/lib/invoice-copy";
import type { InvoicePdfInput } from "@/lib/invoice-pdf";
import {
  amountDueMinor,
  formatDurationHms,
  formatInvoiceDate,
  formatInvoiceMoney,
  formatPercentBps,
} from "@/lib/invoice-money";

export function toInvoicePdfInput(input: {
  companyName: string;
  companyAddress: string;
  number: string;
  clientName: string;
  clientAddress: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  poNumber: string | null;
  notes: string;
  bankDetails: string;
  discountMinor: number;
  discountKind: string;
  discountBps: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  lines: Array<{
    title: string;
    detail: string;
    quantitySeconds: number;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
}): InvoicePdfInput {
  const money = (amount: number) => formatInvoiceMoney(amount, input.currency);
  const totals: InvoicePdfInput["totals"] = [{ label: invoiceCopy.subtotal, value: money(input.subtotalMinor) }];
  if (input.discountMinor > 0) {
    const label =
      input.discountKind === "percent"
        ? `${invoiceCopy.discount} (${formatPercentBps(input.discountBps)})`
        : invoiceCopy.discount;
    totals.push({ label, value: money(-input.discountMinor) });
  }
  if (input.taxEnabled) {
    totals.push({
      label: `${input.taxLabel} (${formatPercentBps(input.taxRateBps)})`,
      value: money(input.taxMinor),
    });
  }
  totals.push(
    { label: invoiceCopy.total, value: money(input.totalMinor) },
    { label: invoiceCopy.paid, value: money(input.paidMinor) },
    {
      label: invoiceCopy.amountDue,
      value: money(amountDueMinor(input.totalMinor, input.paidMinor)),
      emphasize: true,
    },
  );
  return {
    number: input.number,
    companyName: input.companyName,
    companyAddress: input.companyAddress,
    clientName: input.clientName,
    clientAddress: input.clientAddress,
    issueDate: formatInvoiceDate(input.issueDate),
    dueDate: formatInvoiceDate(input.dueDate),
    poNumber: input.poNumber,
    notes: input.notes,
    bankDetails: input.bankDetails,
    lines: input.lines.map((line) => ({
      title: line.title,
      detail: line.detail,
      quantity: formatDurationHms(line.quantitySeconds),
      unitPrice: money(line.unitPriceMinor),
      amount: money(line.amountMinor),
    })),
    totals,
  };
}
