import { prisma } from "@/lib/db";
import { hashViewToken, viewTokenBytes, viewTokenHashesMatch } from "@/lib/invoice-view-token";
import { takePublicInvoiceSlot } from "@/lib/rate-limit";

const publicInclude = {
  client: { select: { name: true, address: true, billingAddress: true } },
  lines: { orderBy: { position: "asc" as const } },
} as const;

export type PublicQuotation = {
  number: string;
  status: string;
  currency: string;
  clientName: string;
  clientAddress: string;
  issueDate: Date;
  validUntil: Date;
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
    quantityMs: string;
    quantityKind: string;
    rangeStart: Date | null;
    rangeEnd: Date | null;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
};

/**
 * One quotation, and only after it has been sent. Drafts and unknown tokens
 * are the same result: not found.
 */
export async function findPublicQuotation(token: string): Promise<PublicQuotation | null> {
  if (!viewTokenBytes(token)) return null;
  const tokenHash = hashViewToken(token);
  const row = await prisma.quotation.findUnique({
    where: { viewTokenHash: tokenHash },
    include: publicInclude,
  });
  if (!row?.viewTokenHash || !viewTokenHashesMatch(tokenHash, row.viewTokenHash)) return null;
  if (row.status === "draft") return null;
  const address = row.client.billingAddress?.trim() || row.client.address?.trim() || "";
  return {
    number: row.number,
    status: row.status,
    currency: row.currency,
    clientName: row.client.name,
    clientAddress: address,
    issueDate: row.issueDate,
    validUntil: row.validUntil,
    notes: row.notes,
    terms: row.terms,
    taxEnabled: row.taxEnabled,
    taxLabel: row.taxLabel,
    taxRateBps: row.taxRateBps,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    lines: row.lines.map((line) => ({
      title: line.title,
      detail: line.detail,
      quantitySeconds: line.quantitySeconds,
      quantityMs: line.quantityMs.toString(),
      quantityKind: line.quantityKind,
      rangeStart: line.rangeStart,
      rangeEnd: line.rangeEnd,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: line.amountMinor,
    })),
  };
}

export async function takePublicQuotationRead(ip: string) {
  return takePublicInvoiceSlot(ip);
}
