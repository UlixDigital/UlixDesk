import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | typeof prisma;

/** True when any slice of the entry is on an issued invoice. Drafts and void do not lock. */
export async function timeEntryIsLocked(tx: Tx, timeEntryId: string) {
  const link = await tx.invoiceTime.findFirst({
    where: {
      timeEntryId,
      invoice: { status: { in: ["open", "paid", "partially_paid"] } },
    },
    select: { id: true },
  });
  return link !== null;
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

/** True when Postgres rejected an overlapping billed window. */
export function isSliceConflict(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("23P01") || message.includes("InvoiceTime_no_overlap");
}
