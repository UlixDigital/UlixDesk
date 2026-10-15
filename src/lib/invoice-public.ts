import { prisma } from "@/lib/db";
import { hashViewToken, viewTokenBytes, viewTokenHashesMatch } from "@/lib/invoice-view-token";
import { takePublicInvoiceSlot } from "@/lib/rate-limit";

const publicInclude = {
  client: { select: { name: true, address: true, billingAddress: true } },
  lines: { orderBy: { position: "asc" as const } },
} as const;

export type PublicInvoice = {
  number: string;
  status: string;
  currency: string;
  clientName: string;
  clientAddress: string;
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
  lines: Array<{
    title: string;
    detail: string;
    quantitySeconds: number;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
};

export function publicInvoiceHeaders(extra?: Record<string, string>) {
  return {
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    ...extra,
  };
}

/**
 * One invoice, and only after it has been issued. Drafts and unknown tokens
 * are the same result: not found. Revoked tokens have no hash, so they miss too.
 */
export async function findPublicInvoice(token: string): Promise<PublicInvoice | null> {
  if (!viewTokenBytes(token)) return null;
  const tokenHash = hashViewToken(token);
  const row = await prisma.invoice.findUnique({
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
    dueDate: row.dueDate,
    poNumber: row.poNumber,
    notes: row.notes,
    bankDetails: row.bankDetails,
    discountMinor: row.discountMinor,
    discountKind: row.discountKind,
    discountBps: row.discountBps,
    taxEnabled: row.taxEnabled,
    taxLabel: row.taxLabel,
    taxRateBps: row.taxRateBps,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    paidMinor: row.paidMinor,
    lines: row.lines.map((line) => ({
      title: line.title,
      detail: line.detail,
      quantitySeconds: line.quantitySeconds,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: line.amountMinor,
    })),
  };
}

export async function takePublicInvoiceRead(ip: string) {
  return takePublicInvoiceSlot(ip);
}
