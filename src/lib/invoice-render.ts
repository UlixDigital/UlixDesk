import { toInvoicePdfInput } from "@/lib/invoice-document";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { utcDateKey } from "@/lib/rates";

export async function renderStoredInvoicePdf(input: {
  companyName: string;
  companyAddress: string;
  number: string;
  clientName: string;
  clientAddress: string;
  currency: string;
  issueDate: Date;
  dueDate: Date;
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
  overdue?: boolean;
  status?: string;
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
}) {
  return renderInvoicePdf(
    toInvoicePdfInput({
      companyName: input.companyName,
      companyAddress: input.companyAddress,
      number: input.number,
      clientName: input.clientName,
      clientAddress: input.clientAddress,
      currency: input.currency,
      issueDate: utcDateKey(input.issueDate),
      dueDate: utcDateKey(input.dueDate),
      poNumber: input.poNumber,
      notes: input.notes,
      bankDetails: input.bankDetails,
      discountMinor: input.discountMinor,
      discountKind: input.discountKind,
      discountBps: input.discountBps,
      taxEnabled: input.taxEnabled,
      taxLabel: input.taxLabel,
      taxRateBps: input.taxRateBps,
      subtotalMinor: input.subtotalMinor,
      taxMinor: input.taxMinor,
      totalMinor: input.totalMinor,
      paidMinor: input.paidMinor,
      overdue: input.overdue,
      paid: input.status === "paid",
      lines: input.lines,
    }),
  );
}
