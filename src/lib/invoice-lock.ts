import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isLockedInvoiceStatus } from "@/lib/invoice-form";

type Tx = Prisma.TransactionClient | typeof prisma;

/** True when the entry is on an issued invoice. Drafts and void invoices do not lock. */
export async function timeEntryIsLocked(tx: Tx, timeEntryId: string) {
  const link = await tx.invoiceTime.findUnique({
    where: { timeEntryId },
    select: { invoice: { select: { status: true } } },
  });
  return Boolean(link && isLockedInvoiceStatus(link.invoice.status));
}

export class InvoicedTimeError extends Error {
  readonly code = "INVOICED_TIME";

  constructor() {
    super("INVOICED_TIME");
    this.name = "InvoicedTimeError";
  }
}

export function isInvoicedTimeError(error: unknown) {
  if (error instanceof InvoicedTimeError) return true;
  return error instanceof Error && error.message.includes("INVOICED_TIME");
}
