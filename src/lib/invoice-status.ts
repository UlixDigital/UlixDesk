import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import { isSliceConflict } from "@/lib/invoice-lock";
import { secondsFromMs } from "@/lib/invoice-money";
import { canManageWorkspace } from "@/lib/users-validation";

const REASON_MAX = 500;

type Actor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: invoiceCopy.denied };
}

function fail(error: string) {
  return { ok: false as const, error };
}

export function parseTransitionReason(raw: string) {
  const reason = raw.replace(/\s+/g, " ").trim();
  if (!reason) return fail(invoiceCopy.reasonRequired);
  if (reason.length > REASON_MAX) return fail(invoiceCopy.reasonTooLong);
  return { ok: true as const, reason };
}

/**
 * Safety rules, also written up in docs/INVOICES.md:
 * - Void is open → void only. A payment (a row, or paidMinor above zero) blocks it.
 * - Void sets InvoiceTime.active = false. The edit lock ignores void, and the
 *   overlap constraint ignores inactive windows, so the time can be billed again.
 * - Reopen is open → draft or void → draft, and only with no payment recorded.
 * - open → draft keeps the windows reserved (they stay active) and releases the
 *   edit lock because drafts are not an issued status.
 * - void → draft sets active back to true. That re-checks InvoiceTime_no_overlap.
 *   It is refused when a billed entry was deleted, the entry now belongs to
 *   another client, a slice was billed elsewhere, or the entry was edited so
 *   the slice no longer fits.
 * - An invoice with only manual lines has no InvoiceTime rows. Void and reopen
 *   still follow the payment rules. The missing-time, moved-client, and overlap
 *   checks apply only to time lines.
 */
export async function voidInvoice(input: { actor: Actor; id: string; reason: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const reason = parseTransitionReason(input.reason);
  if (!reason.ok) return reason;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.id} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id: input.id },
      include: { payments: { select: { id: true } }, timeLinks: { select: { timeEntryId: true } } },
    });
    if (!invoice) return fail(invoiceCopy.notFound);
    if (invoice.status !== "open") return fail(invoiceCopy.voidStatus);
    if (invoice.payments.length > 0 || invoice.paidMinor > 0) return fail(invoiceCopy.voidPayments);
    await lockEntries(tx, invoice.timeLinks.map((link) => link.timeEntryId));
    await tx.invoiceTime.updateMany({ where: { invoiceId: invoice.id }, data: { active: false } });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "void", voidedAt: new Date() },
    });
    await tx.invoiceStatusEvent.create({
      data: {
        invoiceId: invoice.id,
        actorId: input.actor.id,
        fromStatus: "open",
        toStatus: "void",
        reason: reason.reason,
      },
    });
    return { ok: true as const };
  });
}

export async function reopenInvoice(input: { actor: Actor; id: string; reason: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const reason = parseTransitionReason(input.reason);
  if (!reason.ok) return reason;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({
        where: { id: input.id },
        include: {
          payments: { select: { id: true } },
          lines: {
            select: {
              kind: true,
              quantitySeconds: true,
              timeLinks: { select: { sliceStart: true, sliceEnd: true } },
            },
          },
          timeLinks: {
            include: {
              timeEntry: {
                select: {
                  startedAt: true,
                  endedAt: true,
                  project: { select: { clientId: true } },
                },
              },
            },
          },
        },
      });
      if (!invoice) return fail(invoiceCopy.notFound);
      if (invoice.status !== "open" && invoice.status !== "void") return fail(invoiceCopy.reopenStatus);
      if (invoice.payments.length > 0 || invoice.paidMinor > 0) return fail(invoiceCopy.reopenPayments);
      const fromStatus = invoice.status;
      await lockEntries(
        tx,
        invoice.timeLinks.map((link) => link.timeEntryId),
      );
      if (fromStatus === "void") {
        const restored = await restoreVoidSlices(tx, invoice);
        if (!restored.ok) return restored;
      } else {
        const clash = await overlappingActiveSlice(tx, invoice.id);
        if (clash) return fail(invoiceCopy.reopenTaken);
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "draft", issuedAt: null, voidedAt: null },
      });
      await tx.invoiceStatusEvent.create({
        data: {
          invoiceId: invoice.id,
          actorId: input.actor.id,
          fromStatus,
          toStatus: "draft",
          reason: reason.reason,
        },
      });
      return { ok: true as const };
    });
  } catch (error) {
    if (isSliceConflict(error)) return fail(invoiceCopy.reopenTaken);
    throw error;
  }
}

async function lockEntries(tx: Prisma.TransactionClient, ids: string[]) {
  const entryIds = [...new Set(ids)].sort();
  if (entryIds.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "TimeEntry" WHERE "id" IN (${Prisma.join(entryIds)}) ORDER BY "id" FOR UPDATE`;
}

async function overlappingActiveSlice(tx: Prisma.TransactionClient, invoiceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT mine."id"
    FROM "InvoiceTime" AS mine
    JOIN "InvoiceTime" AS other
      ON other."timeEntryId" = mine."timeEntryId"
     AND other."active" = true
     AND other."id" <> mine."id"
     AND tsrange(mine."sliceStart", mine."sliceEnd", '[)') && tsrange(other."sliceStart", other."sliceEnd", '[)')
    WHERE mine."invoiceId" = ${invoiceId}
    LIMIT 1
  `;
  return rows.length > 0;
}

type VoidLine = {
  kind: string;
  quantitySeconds: number;
  timeLinks: Array<{ sliceStart: Date; sliceEnd: Date }>;
};

type VoidLink = {
  sliceStart: Date;
  sliceEnd: Date;
  timeEntry: {
    startedAt: Date;
    endedAt: Date | null;
    project: { clientId: string | null };
  };
};

async function restoreVoidSlices(
  tx: Prisma.TransactionClient,
  invoice: { id: string; clientId: string; lines: VoidLine[]; timeLinks: VoidLink[] },
) {
  if (voidTimeWasRemoved(invoice.lines)) return fail(invoiceCopy.reopenMissingTime);
  for (const link of invoice.timeLinks) {
    const entry = link.timeEntry;
    if (entry.project.clientId !== invoice.clientId) return fail(invoiceCopy.reopenMoved);
    if (!entry.endedAt || link.sliceStart < entry.startedAt || link.sliceEnd > entry.endedAt) {
      return fail(invoiceCopy.reopenEdited);
    }
  }
  if (await overlappingActiveSlice(tx, invoice.id)) return fail(invoiceCopy.reopenTaken);
  if (invoice.timeLinks.length > 0) {
    await tx.invoiceTime.updateMany({ where: { invoiceId: invoice.id }, data: { active: true } });
  }
  return { ok: true as const };
}

/**
 * Deleting a time entry cascades its InvoiceTime rows away. The line quantity
 * stays. A time line with no windows left, or windows that no longer add up
 * to that quantity, means some billed time is gone.
 */
function voidTimeWasRemoved(lines: VoidLine[]) {
  return lines.some((line) => {
    if (line.kind !== "time") return false;
    if (line.timeLinks.length === 0) return true;
    const ms = line.timeLinks.reduce((sum, link) => sum + (link.sliceEnd.getTime() - link.sliceStart.getTime()), 0);
    return secondsFromMs(ms) !== line.quantitySeconds;
  });
}
