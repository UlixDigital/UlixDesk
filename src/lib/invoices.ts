import { Prisma } from "@prisma/client";
import { DEFAULT_CURRENCY, isCurrencyCode } from "@/lib/currencies";
import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import {
  civilDate,
  dateColumn,
  isInvoiceStatus,
  parseDraftInvoice,
  type DraftWrite,
  type InvoiceStatus,
} from "@/lib/invoice-form";
import { isSliceConflict } from "@/lib/invoice-lock";
import {
  buildInvoiceLines,
  describeTimeLineChanges,
  type BuiltInvoiceLine,
  type InvoiceGrouping,
  type InvoiceSlice,
} from "@/lib/invoice-lines";
import { invoiceTotals, quantityMsFromSeconds, resolveQuantityMs, wholeSecondsFromQuantityMs } from "@/lib/invoice-money";
import { pickRate, utcDateKey, type BillRateRecord } from "@/lib/rates";
import { slicesForEntry, type SourceEntry } from "@/lib/reports";
import { addCalendarDays, startOfWeekDate, todayInTimeZone, zonedDayEnd, zonedDayStart } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace-time";

const WORKSPACE_ID = "workspace";

type Tx = Prisma.TransactionClient;

export type InvoiceActor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: invoiceCopy.denied };
}

function fail(error: string) {
  return { ok: false as const, error };
}

function toRate(row: {
  id: string;
  scope: string;
  clientId: string | null;
  projectId: string | null;
  userId: string | null;
  amountMinor: number;
  currency: string;
  effectiveFrom: Date;
  createdAt: Date;
}): BillRateRecord | null {
  if (row.scope !== "client" && row.scope !== "project" && row.scope !== "member") return null;
  return {
    id: row.id,
    scope: row.scope,
    clientId: row.clientId,
    projectId: row.projectId,
    userId: row.userId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
  };
}

export async function ensureWorkspace(tx: Tx | typeof prisma = prisma) {
  return tx.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: {
      id: WORKSPACE_ID,
      defaultCurrency: DEFAULT_CURRENCY,
      timeZone: DEFAULT_TIME_ZONE,
    },
  });
}

/**
 * Locks the counter row, skips numbers already in the ledger, and advances the
 * counter past the allocated number. The caller must be inside a transaction.
 * A rolled-back transaction does not consume the number. Deleting a draft does
 * not delete the ledger row, so that number is never issued again.
 */
export async function allocateInvoiceNumber(tx: Tx) {
  await ensureWorkspace(tx);
  await tx.$queryRaw`SELECT "id" FROM "WorkspaceSettings" WHERE "id" = ${WORKSPACE_ID} FOR UPDATE`;
  const settings = await tx.workspaceSettings.findUniqueOrThrow({ where: { id: WORKSPACE_ID } });
  let next = settings.nextInvoiceNumber;
  const prefix = settings.invoicePrefix;
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const number = `${prefix}${next}`;
    const taken = await tx.invoiceNumber.findUnique({ where: { number }, select: { number: true } });
    if (!taken) {
      await tx.invoiceNumber.create({ data: { number } });
      await tx.workspaceSettings.update({
        where: { id: WORKSPACE_ID },
        data: { nextInvoiceNumber: next + 1 },
      });
      return number;
    }
    next += 1;
  }
  throw new Error("Could not allocate an invoice number.");
}

const paymentOrder = [{ paidOn: "desc" as const }, { createdAt: "desc" as const }];

const invoiceInclude = {
  client: {
    select: {
      id: true,
      name: true,
      address: true,
      billingAddress: true,
      currency: true,
      emails: { orderBy: { position: "asc" as const }, select: { email: true } },
    },
  },
  lines: { orderBy: { position: "asc" as const }, include: { timeLinks: { select: { timeEntryId: true } } } },
  payments: {
    orderBy: paymentOrder,
    select: {
      id: true,
      amountMinor: true,
      paidOn: true,
      method: true,
      note: true,
      createdAt: true,
      recordedBy: { select: { name: true } },
    },
  },
  statusEvents: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { name: true } } },
  },
  emailsSent: {
    orderBy: { createdAt: "desc" as const },
    include: { sentBy: { select: { name: true } } },
  },
} as const;

export type InvoiceDetail = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export async function getInvoice(actorRole: string, id: string) {
  if (!canManageWorkspace(actorRole)) return null;
  return prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
}

export async function listInvoices(
  actorRole: string,
  filters: { clientId?: string; status?: string; from?: string; to?: string; number?: string },
) {
  if (!canManageWorkspace(actorRole)) return [];
  const number = filters.number?.trim();
  return prisma.invoice.findMany({
    where: {
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.status && isInvoiceStatus(filters.status) ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            issueDate: {
              ...(filters.from ? { gte: dateColumn(filters.from) } : {}),
              ...(filters.to ? { lte: dateColumn(filters.to) } : {}),
            },
          }
        : {}),
      ...(number ? { number: { contains: number, mode: "insensitive" } } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
  });
}

export async function listInvoiceClients() {
  const rows = await prisma.client.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, currency: true },
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

export async function createInvoice(input: {
  actor: InvoiceActor;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  grouping: InvoiceGrouping;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) return fail(invoiceCopy.clientRequired);
  if (client.archivedAt) return fail(invoiceCopy.clientArchived);
  if (!isCurrencyCode(client.currency)) return fail(invoiceCopy.priceInvalid);

  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await ensureWorkspace(tx);
      const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
      const rangeStart = zonedDayStart(input.periodStart, timeZone);
      const rangeEnd = zonedDayEnd(input.periodEnd, timeZone);
      const lockedIds = await lockIssueTimeEntries(tx, {
        invoiceId: null,
        clientId: client.id,
        rangeStart,
        rangeEnd,
      });
      const rows = await lockedEntries(tx, lockedIds);
      const rates = await loadRates(tx);
      const built = buildInvoiceLines({
        grouping: input.grouping,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        slices: rowsToSlices(
          rows,
          rates,
          client.currency,
          timeZone,
          rangeStart,
          rangeEnd,
          await takenSlices(tx, lockedIds, null),
        ),
      });
      if (built.lines.length === 0) return fail(invoiceCopy.noEligible);
      const number = await allocateInvoiceNumber(tx);
      const totals = invoiceTotals({
        lineAmounts: built.lines.map((line) => line.amountMinor),
        discountKind: "none",
        discountAmountMinor: 0,
        discountBps: 0,
        taxEnabled: settings.invoiceTaxEnabled,
        taxRateBps: settings.invoiceTaxRateBps,
      });
      const issueDate = todayInTimeZone(timeZone);
      const dueDate = addCalendarDays(issueDate, settings.invoiceNetTermsDays);
      const invoice = await tx.invoice.create({
        data: {
          number,
          clientId: client.id,
          status: "draft",
          currency: client.currency,
          issueDate: dateColumn(issueDate),
          dueDate: dateColumn(dueDate),
          periodStart: dateColumn(input.periodStart),
          periodEnd: dateColumn(input.periodEnd),
          grouping: input.grouping,
          notes: settings.invoiceNotes,
          bankDetails: settings.invoiceBankDetails,
          taxEnabled: settings.invoiceTaxEnabled,
          taxLabel: settings.invoiceTaxLabel,
          taxRateBps: settings.invoiceTaxRateBps,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          paidMinor: 0,
          createdById: input.actor.id,
          lines: {
            create: built.lines.map((line, position) => ({
              position,
              kind: "time",
              title: line.title.slice(0, 200),
              detail: line.detail.slice(0, 200),
              quantitySeconds: line.quantitySeconds,
              quantityMs: quantityMsFromSeconds(line.quantitySeconds),
              unitPriceMinor: line.unitPriceMinor,
              amountMinor: line.amountMinor,
            })),
          },
        },
        include: { lines: { orderBy: { position: "asc" } } },
      });
      await linkTimeLines(tx, invoice.id, invoice.lines, built.lines);
      return {
        ok: true as const,
        id: invoice.id,
        number: invoice.number,
        unrated: built.unrated,
      };
    });
  } catch (error) {
    if (isSliceConflict(error)) return fail(invoiceCopy.timeTaken);
    if (error instanceof Error && error.message === "Amount is too large.") {
      return fail(invoiceCopy.amountTooLarge);
    }
    throw error;
  }
}

/**
 * A draft with no lines. The number, currency, and issue/due dates follow the
 * same rules as an invoice generated from time. Tracked time is not attached
 * until someone adds it on the draft.
 */
export async function createBlankInvoice(input: { actor: InvoiceActor; clientId: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) return fail(invoiceCopy.clientRequired);
  if (client.archivedAt) return fail(invoiceCopy.clientArchived);
  if (!isCurrencyCode(client.currency)) return fail(invoiceCopy.priceInvalid);

  return prisma.$transaction(async (tx) => {
    const settings = await ensureWorkspace(tx);
    const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
    const number = await allocateInvoiceNumber(tx);
    const issueDate = todayInTimeZone(timeZone);
    const dueDate = addCalendarDays(issueDate, settings.invoiceNetTermsDays);
    const thisMonday = startOfWeekDate(issueDate);
    const periodStart = addCalendarDays(thisMonday, -7);
    const periodEnd = addCalendarDays(thisMonday, -1);
    const totals = invoiceTotals({
      lineAmounts: [],
      discountKind: "none",
      discountAmountMinor: 0,
      discountBps: 0,
      taxEnabled: settings.invoiceTaxEnabled,
      taxRateBps: settings.invoiceTaxRateBps,
    });
    const invoice = await tx.invoice.create({
      data: {
        number,
        clientId: client.id,
        status: "draft",
        currency: client.currency,
        issueDate: dateColumn(issueDate),
        dueDate: dateColumn(dueDate),
        periodStart: dateColumn(periodStart),
        periodEnd: dateColumn(periodEnd),
        grouping: "period",
        notes: settings.invoiceNotes,
        bankDetails: settings.invoiceBankDetails,
        taxEnabled: settings.invoiceTaxEnabled,
        taxLabel: settings.invoiceTaxLabel,
        taxRateBps: settings.invoiceTaxRateBps,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        paidMinor: 0,
        createdById: input.actor.id,
      },
    });
    return { ok: true as const, id: invoice.id, number: invoice.number };
  });
}

export async function saveDraft(input: {
  actor: InvoiceActor;
  id: string;
  draft: DraftWrite;
  issue: boolean;
  /** Issue even when the re-derived time lines differ from the draft. */
  confirm?: boolean;
  /** Recorded on the draft → open audit row. */
  issueReason?: string;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({
        where: { id: input.id },
        include: { lines: { include: { timeLinks: true } } },
      });
      if (!invoice) return fail(invoiceCopy.notFound);
      if (invoice.status !== "draft") return fail(invoiceCopy.notDraft);

      const period = draftPeriod(invoice, input.draft);
      let draftLines = input.draft.lines;
      let preservedIds: string[] = [];
      let derivedAmounts: number[] = [];
      if (input.issue) {
        const prepared = await prepareIssue(tx, invoice, period);
        if (prepared.diffs.length > 0 && !input.confirm) {
          return { ok: false as const, confirm: true as const, diffs: prepared.diffs };
        }
        if (prepared.diffs.length > 0 && input.confirm) {
          const oldTimeIds = new Set(invoice.lines.filter((line) => line.kind === "time").map((line) => line.id));
          draftLines = input.draft.lines.filter((line) => !line.id || !oldTimeIds.has(line.id));
          await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id, kind: "time" } });
          preservedIds = await insertTimeLines(tx, invoice.id, prepared.derived);
          derivedAmounts = prepared.derived.map((line) => line.amountMinor);
        }
      }

      const keptIds = new Set([
        ...draftLines.flatMap((line) => (line.id ? [line.id] : [])),
        ...preservedIds,
      ]);
      const existing = new Map(invoice.lines.map((line) => [line.id, line]));
      for (const id of keptIds) {
        if (!existing.has(id) && !preservedIds.includes(id)) return fail(invoiceCopy.notDraft);
      }
      let totals: ReturnType<typeof invoiceTotals>;
      try {
        totals = invoiceTotals({
          lineAmounts: [...derivedAmounts, ...draftLines.map((line) => line.amountMinor)],
          discountKind: input.draft.discountKind,
          discountAmountMinor: input.draft.discountAmountMinor,
          discountBps: input.draft.discountBps,
          taxEnabled: input.draft.taxEnabled,
          taxRateBps: input.draft.taxRateBps,
        });
      } catch {
        return fail(invoiceCopy.amountTooLarge);
      }

      const removed = invoice.lines.filter((line) => !keptIds.has(line.id));
      if (removed.length > 0) {
        await tx.invoiceLine.deleteMany({ where: { id: { in: removed.map((line) => line.id) } } });
      }

      for (let position = 0; position < draftLines.length; position += 1) {
        const line = draftLines[position];
        if (!line) continue;
        if (line.id) {
          const prior = existing.get(line.id);
          if (!prior) return fail(invoiceCopy.notDraft);
          const kind = prior.kind === "time" ? "time" : "custom";
          await tx.invoiceLine.update({
            where: { id: line.id },
            data: {
              position,
              ...lineColumns(line, kind),
            },
          });
        } else {
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              position,
              kind: "custom",
              ...lineColumns(line, "custom"),
            },
          });
        }
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          issueDate: dateColumn(input.draft.issueDate),
          dueDate: dateColumn(input.draft.dueDate),
          poNumber: input.draft.poNumber,
          periodStart: dateColumn(period.periodStart),
          periodEnd: dateColumn(period.periodEnd),
          grouping: period.grouping,
          notes: input.draft.notes,
          bankDetails: input.draft.bankDetails,
          discountKind: input.draft.discountKind,
          discountAmountMinor: input.draft.discountAmountMinor,
          discountBps: input.draft.discountBps,
          taxEnabled: input.draft.taxEnabled,
          taxLabel: input.draft.taxLabel,
          taxRateBps: input.draft.taxRateBps,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          ...(input.issue ? { status: "open", issuedAt: new Date() } : {}),
        },
      });
      if (preservedIds.length > 0) await renumberLines(tx, invoice.id);
      if (input.issue) {
        const reason = (input.issueReason ?? "Marked as issued").trim().slice(0, 500);
        await tx.invoiceStatusEvent.create({
          data: {
            invoiceId: invoice.id,
            actorId: input.actor.id,
            fromStatus: "draft",
            toStatus: "open",
            reason: reason || "Marked as issued",
          },
        });
      }
      return { ok: true as const, issued: input.issue };
    });
  } catch (error) {
    if (isSliceConflict(error)) return fail(invoiceCopy.timeTaken);
    throw error;
  }
}

export async function refreshDraftFromTime(input: { actor: InvoiceActor; id: string; draft: DraftWrite }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({
        where: { id: input.id },
        include: { lines: true },
      });
      if (!invoice) return fail(invoiceCopy.notFound);
      if (invoice.status !== "draft") return fail(invoiceCopy.notDraft);
      const settings = await ensureWorkspace(tx);
      const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
      const period = draftPeriod(invoice, input.draft);
      const periodStart = period.periodStart;
      const periodEnd = period.periodEnd;
      const rangeStart = zonedDayStart(periodStart, timeZone);
      const rangeEnd = zonedDayEnd(periodEnd, timeZone);
      const lockedIds = await lockIssueTimeEntries(tx, {
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        rangeStart,
        rangeEnd,
      });
      const rows = (await lockedEntries(tx, lockedIds)).filter(
        (row) => row.billable && row.project.billable && row.project.clientId === invoice.clientId,
      );
      const derived = buildInvoiceLines({
        grouping: period.grouping,
        periodStart,
        periodEnd,
        slices: rowsToSlices(
          rows,
          await loadRates(tx),
          invoice.currency,
          timeZone,
          rangeStart,
          rangeEnd,
          await takenSlices(tx, lockedIds, invoice.id),
        ),
      }).lines;
      const oldTimeIds = new Set(invoice.lines.filter((line) => line.kind === "time").map((line) => line.id));
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id, kind: "time" } });
      const preservedIds = await insertTimeLines(tx, invoice.id, derived);
      const customLines = input.draft.lines.filter((line) => !line.id || !oldTimeIds.has(line.id));
      const keptIds = new Set([
        ...customLines.flatMap((line) => (line.id ? [line.id] : [])),
        ...preservedIds,
      ]);
      const removed = invoice.lines.filter((line) => line.kind !== "time" && !keptIds.has(line.id));
      if (removed.length > 0) {
        await tx.invoiceLine.deleteMany({ where: { id: { in: removed.map((line) => line.id) } } });
      }
      for (let index = 0; index < customLines.length; index += 1) {
        const line = customLines[index];
        if (!line) continue;
        const position = preservedIds.length + index;
        if (line.id) {
          await tx.invoiceLine.update({
            where: { id: line.id },
            data: {
              position,
              ...lineColumns(line, "custom"),
            },
          });
        } else {
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              position,
              kind: "custom",
              ...lineColumns(line, "custom"),
            },
          });
        }
      }
      await renumberLines(tx, invoice.id);
      const totals = invoiceTotals({
        lineAmounts: [...derived.map((line) => line.amountMinor), ...customLines.map((line) => line.amountMinor)],
        discountKind: input.draft.discountKind,
        discountAmountMinor: input.draft.discountAmountMinor,
        discountBps: input.draft.discountBps,
        taxEnabled: input.draft.taxEnabled,
        taxRateBps: input.draft.taxRateBps,
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          issueDate: dateColumn(input.draft.issueDate),
          dueDate: dateColumn(input.draft.dueDate),
          poNumber: input.draft.poNumber,
          periodStart: dateColumn(period.periodStart),
          periodEnd: dateColumn(period.periodEnd),
          grouping: period.grouping,
          notes: input.draft.notes,
          bankDetails: input.draft.bankDetails,
          discountKind: input.draft.discountKind,
          discountAmountMinor: input.draft.discountAmountMinor,
          discountBps: input.draft.discountBps,
          taxEnabled: input.draft.taxEnabled,
          taxLabel: input.draft.taxLabel,
          taxRateBps: input.draft.taxRateBps,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
        },
      });
      return { ok: true as const };
    });
  } catch (error) {
    if (isSliceConflict(error)) return fail(invoiceCopy.timeTaken);
    if (error instanceof Error && error.message === "Amount is too large.") {
      return fail(invoiceCopy.amountTooLarge);
    }
    throw error;
  }
}

export function storedDraft(invoice: {
  issueDate: Date;
  dueDate: Date;
  poNumber: string | null;
  periodStart: Date;
  periodEnd: Date;
  grouping: string;
  notes: string;
  bankDetails: string;
  discountKind: string;
  discountAmountMinor: number;
  discountBps: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  lines: Array<{
    id: string;
    title: string;
    detail: string;
    quantitySeconds: number;
    quantityMs?: bigint | null;
    rangeStart?: Date | null;
    rangeEnd?: Date | null;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
}): DraftWrite {
  const discountKind =
    invoice.discountKind === "amount" || invoice.discountKind === "percent" ? invoice.discountKind : "none";
  return {
    issueDate: invoiceDateKey(invoice.issueDate),
    dueDate: invoiceDateKey(invoice.dueDate),
    poNumber: invoice.poNumber,
    periodStart: invoiceDateKey(invoice.periodStart),
    periodEnd: invoiceDateKey(invoice.periodEnd),
    grouping: groupingOf(invoice.grouping),
    notes: invoice.notes,
    bankDetails: invoice.bankDetails,
    discountKind,
    discountAmountMinor: invoice.discountAmountMinor,
    discountBps: invoice.discountBps,
    taxEnabled: invoice.taxEnabled,
    taxLabel: invoice.taxLabel,
    taxRateBps: invoice.taxRateBps,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      title: line.title,
      detail: line.detail,
      quantitySeconds: line.quantitySeconds,
      quantityMs: resolveQuantityMs(line),
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: line.amountMinor,
      rangeStart: line.rangeStart ? invoiceDateKey(line.rangeStart) : null,
      rangeEnd: line.rangeEnd ? invoiceDateKey(line.rangeEnd) : null,
    })),
  };
}

/** Issues the saved draft. A draft that is already open is left as it is. */
export async function issueSavedDraft(input: {
  actor: InvoiceActor;
  id: string;
  confirm?: boolean;
  reason?: string;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.id },
    include: { lines: true },
  });
  if (!invoice) return fail(invoiceCopy.notFound);
  if (invoice.status !== "draft") return { ok: true as const, issued: false as const, status: invoice.status };
  return saveDraft({
    actor: input.actor,
    id: input.id,
    draft: storedDraft(invoice),
    issue: true,
    confirm: input.confirm,
    issueReason: input.reason,
  });
}

export async function deleteDraft(input: { actor: InvoiceActor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const invoice = await prisma.invoice.findUnique({ where: { id: input.id }, select: { status: true } });
  if (!invoice) return fail(invoiceCopy.notFound);
  if (invoice.status !== "draft") return fail(invoiceCopy.notDraft);
  await prisma.invoice.delete({ where: { id: input.id } });
  return { ok: true as const };
}

export async function unratedForInvoice(invoice: {
  id: string;
  clientId: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
}) {
  if (invoice.status !== "draft") return [];
  const settings = await ensureWorkspace();
  const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
  const start = utcDateKey(invoice.periodStart);
  const end = utcDateKey(invoice.periodEnd);
  const rangeStart = zonedDayStart(start, timeZone);
  const rangeEnd = zonedDayEnd(end, timeZone);
  const rows = await overlappingEntries(prisma, {
    clientId: invoice.clientId,
    rangeStart,
    rangeEnd,
  });
  const slices = rowsToSlices(
    rows,
    await loadRates(prisma),
    invoice.currency,
    timeZone,
    rangeStart,
    rangeEnd,
    await takenSlices(prisma, rows.map((row) => row.id), null),
  );
  return buildInvoiceLines({ grouping: "period", periodStart: start, periodEnd: end, slices }).unrated;
}

export function parseDraftFromForm(formData: FormData, currency: string) {
  const ids = formData.getAll("lineId").map(String);
  const titles = formData.getAll("lineTitle").map(String);
  const details = formData.getAll("lineDetail").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const prices = formData.getAll("lineUnitPrice").map(String);
  const rangeStarts = formData.getAll("lineRangeStart").map(String);
  const rangeEnds = formData.getAll("lineRangeEnd").map(String);
  const count = Math.max(ids.length, titles.length, quantities.length, prices.length, rangeStarts.length);
  const lines = Array.from({ length: count }, (_, index) => ({
    id: ids[index] ?? "",
    title: titles[index] ?? "",
    detail: details[index] ?? "",
    quantity: quantities[index] ?? "",
    unitPrice: prices[index] ?? "",
    rangeStart: rangeStarts[index] ?? "",
    rangeEnd: rangeEnds[index] ?? "",
  })).filter(
    (line) =>
      line.title.trim() ||
      line.quantity.trim() ||
      line.unitPrice.trim() ||
      line.id.trim() ||
      line.rangeStart.trim() ||
      line.rangeEnd.trim(),
  );
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  const grouping = String(formData.get("grouping") ?? "").trim();
  return parseDraftInvoice(
    {
      issueDate: String(formData.get("issueDate") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
      poNumber: String(formData.get("poNumber") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      bankDetails: String(formData.get("bankDetails") ?? ""),
      discountKind: String(formData.get("discountKind") ?? "none"),
      discountValue: String(formData.get("discountValue") ?? ""),
      taxEnabled: formData.get("taxEnabled") === "on",
      taxLabel: String(formData.get("taxLabel") ?? ""),
      taxRate: String(formData.get("taxRate") ?? ""),
      lines,
      ...(periodStart || periodEnd || grouping ? { periodStart, periodEnd, grouping } : {}),
    },
    currency,
  );
}

export function invoiceDateKey(value: Date) {
  return civilDate(value);
}

export type { InvoiceStatus };

type EntryRow = {
  id: string;
  projectId: string;
  userId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  billable: boolean;
  project: { id: string; name: string; clientId: string | null; billable: boolean };
  user: { id: string; name: string } | null;
};

const entryInclude = {
  project: { select: { id: true, name: true, clientId: true, billable: true } },
  user: { select: { id: true, name: true } },
} as const;

/**
 * Lock every time row this invoice might bill or unlink, before any write.
 * A row that crosses midnight is still one TimeEntry. The lock covers the
 * whole entry even when only one slice is billed.
 */
async function lockIssueTimeEntries(
  tx: Tx,
  input: { invoiceId: string | null; clientId: string; rangeStart: Date; rangeEnd: Date },
) {
  const rows = input.invoiceId
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT te."id"
        FROM "TimeEntry" te
        INNER JOIN "Project" p ON p."id" = te."projectId"
        WHERE te."endedAt" IS NOT NULL
          AND (
            (
              te."billable" = true
              AND p."billable" = true
              AND p."clientId" = ${input.clientId}
              AND te."startedAt" < ${input.rangeEnd}
              AND te."endedAt" > ${input.rangeStart}
            )
            OR te."id" IN (
              SELECT link."timeEntryId" FROM "InvoiceTime" AS link WHERE link."invoiceId" = ${input.invoiceId}
            )
          )
        ORDER BY te."id"
        FOR UPDATE OF te
      `
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT te."id"
        FROM "TimeEntry" te
        INNER JOIN "Project" p ON p."id" = te."projectId"
        WHERE te."endedAt" IS NOT NULL
          AND te."billable" = true
          AND p."billable" = true
          AND p."clientId" = ${input.clientId}
          AND te."startedAt" < ${input.rangeEnd}
          AND te."endedAt" > ${input.rangeStart}
        ORDER BY te."id"
        FOR UPDATE OF te
      `;
  return rows.map((row) => row.id);
}

async function prepareIssue(
  tx: Tx,
  invoice: {
    id: string;
    clientId: string;
    currency: string;
    grouping: string;
    periodStart: Date;
    periodEnd: Date;
    lines: Array<{ kind: string; title: string; detail: string; quantitySeconds: number; unitPriceMinor: number; amountMinor: number }>;
  },
  period: { periodStart: string; periodEnd: string; grouping: InvoiceGrouping },
) {
  if (!invoice.lines.some((line) => line.kind === "time")) {
    return { derived: [] as BuiltInvoiceLine[], diffs: [] as string[] };
  }
  const settings = await tx.workspaceSettings.findUnique({ where: { id: WORKSPACE_ID } });
  const timeZone = settings?.timeZone || DEFAULT_TIME_ZONE;
  const periodStart = period.periodStart;
  const periodEnd = period.periodEnd;
  const rangeStart = zonedDayStart(periodStart, timeZone);
  const rangeEnd = zonedDayEnd(periodEnd, timeZone);
  const lockedIds = await lockIssueTimeEntries(tx, {
    invoiceId: invoice.id,
    clientId: invoice.clientId,
    rangeStart,
    rangeEnd,
  });
  const rows = await lockedEntries(tx, lockedIds);
  const derived = buildInvoiceLines({
    grouping: period.grouping,
    periodStart,
    periodEnd,
    slices: rowsToSlices(
      rows.filter((row) => row.billable && row.project.billable && row.project.clientId === invoice.clientId),
      await loadRates(tx),
      invoice.currency,
      timeZone,
      rangeStart,
      rangeEnd,
      await takenSlices(tx, lockedIds, invoice.id),
    ),
  }).lines;
  return {
    derived,
    diffs: describeTimeLineChanges(
      invoice.lines.filter((line) => line.kind === "time"),
      derived,
      invoice.currency,
    ),
  };
}

async function lockedEntries(tx: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  return tx.timeEntry.findMany({ where: { id: { in: ids } }, include: entryInclude });
}

async function overlappingEntries(
  tx: Tx | typeof prisma,
  input: { clientId: string; rangeStart: Date; rangeEnd: Date },
) {
  return tx.timeEntry.findMany({
    where: {
      billable: true,
      startedAt: { lt: input.rangeEnd },
      endedAt: { gt: input.rangeStart },
      project: { clientId: input.clientId, billable: true },
    },
    include: entryInclude,
  });
}

type TakenWindow = { start: number; end: number };

/** Windows already reserved by other invoices. This invoice's own windows are omitted so a refresh can shrink or drop them. */
async function takenSlices(tx: Tx | typeof prisma, entryIds: string[], exceptInvoiceId: string | null) {
  const map = new Map<string, TakenWindow[]>();
  if (entryIds.length === 0) return map;
  const rows = await tx.invoiceTime.findMany({
    where: {
      timeEntryId: { in: entryIds },
      active: true,
      ...(exceptInvoiceId ? { invoiceId: { not: exceptInvoiceId } } : {}),
    },
    select: { timeEntryId: true, sliceStart: true, sliceEnd: true },
  });
  for (const row of rows) {
    const list = map.get(row.timeEntryId) ?? [];
    list.push({ start: row.sliceStart.getTime(), end: row.sliceEnd.getTime() });
    map.set(row.timeEntryId, list);
  }
  return map;
}

/** Subtract reserved windows. The result stays inside [start, end). */
function freeWindows(start: number, end: number, taken: TakenWindow[]) {
  const windows: TakenWindow[] = [];
  let cursor = start;
  const ranges = [...taken].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start >= end) break;
    if (range.start > cursor) windows.push({ start: cursor, end: Math.min(range.start, end) });
    cursor = Math.max(cursor, range.end);
    if (cursor >= end) return windows;
  }
  if (cursor < end) windows.push({ start: cursor, end });
  return windows;
}

async function loadRates(tx: Tx | typeof prisma) {
  const rateRows = await tx.billRate.findMany();
  return rateRows.flatMap((row) => {
    const record = toRate(row);
    return record ? [record] : [];
  });
}

/**
 * Split each entry on workspace midnights with the report helper, then price
 * the slice at its own start so a rate that begins at midnight applies only
 * after midnight.
 */
function rowsToSlices(
  rows: EntryRow[],
  rates: BillRateRecord[],
  currency: string,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
  taken: Map<string, TakenWindow[]>,
) {
  const slices: InvoiceSlice[] = [];
  for (const row of rows) {
    if (!row.endedAt) continue;
    const source: SourceEntry = {
      id: row.id,
      userId: row.userId,
      userName: row.user?.name ?? "Unknown member",
      projectId: row.projectId,
      projectName: row.project.name,
      clientId: row.project.clientId,
      clientName: null,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      billable: row.billable,
      projectBillable: row.project.billable,
      note: null,
      rate: null,
    };
    for (const slice of slicesForEntry(source, rangeStart, rangeEnd, timeZone)) {
      const sliceStartMs = Math.max(
        row.startedAt.getTime(),
        zonedDayStart(slice.date, timeZone).getTime(),
        rangeStart.getTime(),
      );
      const sliceEndMs = Math.min(row.endedAt.getTime(), zonedDayEnd(slice.date, timeZone).getTime(), rangeEnd.getTime());
      if (sliceEndMs <= sliceStartMs) continue;
      const rateAt = new Date(sliceStartMs);
      const rate = pickRate(
        rates,
        { projectId: row.projectId, clientId: row.project.clientId, userId: row.userId, startedAt: rateAt },
        timeZone,
      );
      let rateMinor: number | null = null;
      let unratedReason: InvoiceSlice["unratedReason"] = null;
      if (!rate) unratedReason = "no-rate";
      else if (rate.currency !== currency) unratedReason = "currency";
      else rateMinor = rate.amountMinor;
      for (const piece of freeWindows(sliceStartMs, sliceEndMs, taken.get(row.id) ?? [])) {
        if (piece.end <= piece.start) continue;
        slices.push({
          timeEntryId: row.id,
          projectId: row.projectId,
          projectName: row.project.name,
          userId: row.userId,
          userName: row.user?.name ?? "Unknown member",
          day: slice.date,
          durationMs: piece.end - piece.start,
          sliceStart: new Date(piece.start),
          sliceEnd: new Date(piece.end),
          rateMinor,
          unratedReason,
        });
      }
    }
  }
  return slices;
}

async function insertTimeLines(tx: Tx, invoiceId: string, lines: BuiltInvoiceLine[]) {
  const ids: string[] = [];
  for (let position = 0; position < lines.length; position += 1) {
    const line = lines[position];
    if (!line) continue;
    const created = await tx.invoiceLine.create({
      data: {
        invoiceId,
        position,
        kind: "time",
        title: line.title.slice(0, 200),
        detail: line.detail.slice(0, 200),
        quantitySeconds: line.quantitySeconds,
        quantityMs: quantityMsFromSeconds(line.quantitySeconds),
        unitPriceMinor: line.unitPriceMinor,
        amountMinor: line.amountMinor,
      },
    });
    ids.push(created.id);
    await linkWindows(tx, invoiceId, created.id, line.windows);
  }
  return ids;
}

async function linkTimeLines(
  tx: Tx,
  invoiceId: string,
  lines: Array<{ id: string; position: number }>,
  built: BuiltInvoiceLine[],
) {
  for (const line of lines) {
    const source = built[line.position];
    if (!source) continue;
    await linkWindows(tx, invoiceId, line.id, source.windows);
  }
}

async function linkWindows(
  tx: Tx,
  invoiceId: string,
  invoiceLineId: string,
  windows: BuiltInvoiceLine["windows"],
) {
  if (windows.length === 0) return;
  await tx.invoiceTime.createMany({
    data: windows.map((window) => ({
      timeEntryId: window.timeEntryId,
      invoiceId,
      invoiceLineId,
      sliceStart: window.sliceStart,
      sliceEnd: window.sliceEnd,
    })),
  });
}

async function renumberLines(tx: Tx, invoiceId: string) {
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId } });
  const ordered = [
    ...lines.filter((line) => line.kind === "time").sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    ...lines.filter((line) => line.kind !== "time").sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
  ];
  for (let position = 0; position < ordered.length; position += 1) {
    const line = ordered[position];
    if (!line || line.position === position) continue;
    await tx.invoiceLine.update({ where: { id: line.id }, data: { position } });
  }
}

function draftPeriod(
  invoice: { periodStart: Date; periodEnd: Date; grouping: string },
  draft: DraftWrite,
) {
  return {
    periodStart: draft.periodStart ?? utcDateKey(invoice.periodStart),
    periodEnd: draft.periodEnd ?? utcDateKey(invoice.periodEnd),
    grouping: draft.grouping ?? groupingOf(invoice.grouping),
  };
}

function lineColumns(line: DraftWrite["lines"][number], kind: "time" | "custom") {
  const quantityMs = line.quantityMs ?? quantityMsFromSeconds(line.quantitySeconds);
  const quantitySeconds = line.quantityMs === undefined ? line.quantitySeconds : wholeSecondsFromQuantityMs(quantityMs);
  const rangeStart = kind === "custom" ? line.rangeStart : null;
  const rangeEnd = kind === "custom" ? line.rangeEnd : null;
  return {
    title: line.title,
    detail: line.detail,
    quantitySeconds,
    quantityMs,
    unitPriceMinor: line.unitPriceMinor,
    amountMinor: line.amountMinor,
    rangeStart: rangeStart && rangeEnd ? dateColumn(rangeStart) : null,
    rangeEnd: rangeStart && rangeEnd ? dateColumn(rangeEnd) : null,
  };
}

function groupingOf(value: string): InvoiceGrouping {
  if (value === "project" || value === "member" || value === "day") return value;
  return "period";
}

