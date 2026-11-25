import { toCsv } from "@/lib/csv";
import { formatMoneyNumber } from "@/lib/money";
import { quotationCopy, quotationStatusLabel } from "@/lib/quotation-copy";

export type QuotationCsvRow = {
  number: string;
  clientName: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  status: string;
};

export function quotationsToCsv(rows: QuotationCsvRow[]) {
  const header = [
    quotationCopy.number,
    quotationCopy.client,
    quotationCopy.issueDate,
    quotationCopy.validUntil,
    "Currency",
    quotationCopy.subtotal,
    quotationCopy.tax,
    quotationCopy.total,
    quotationCopy.status,
  ];
  const body = rows.map((row) => [
    row.number,
    row.clientName,
    row.issueDate,
    row.validUntil,
    row.currency,
    formatMoneyNumber(row.subtotalMinor, row.currency),
    formatMoneyNumber(row.taxMinor, row.currency),
    formatMoneyNumber(row.totalMinor, row.currency),
    quotationStatusLabel(row.status),
  ]);
  return toCsv([header, ...body]);
}
