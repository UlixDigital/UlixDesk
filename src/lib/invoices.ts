import type { Prisma } from "@prisma/client";
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
import { buildInvoiceLines, type InvoiceGrouping, type InvoiceSlice } from "@/lib/invoice-lines";
import { invoiceTotals } from "@/lib/invoice-money";
import { pickRate, utcDateKey, type BillRateRecord } from "@/lib/rates";
import { addCalendarDays, todayInTimeZone, zonedDayEnd, zonedDayStart, zonedParts } from "@/lib/time-zone";
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

const invoiceInclude = {
  client: { select: { id: true, name: true, address: true, billingAddress: true, currency: true } },
  lines: { orderBy: { position: "asc" as const }, include: { timeLinks: { select: { timeEntryId: true } } } },
  payments: { select: { id: true, amountMinor: true, paidOn: true, method: true, note: true } },
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
      const number = await allocateInvoiceNumber(tx);
      const rows = await tx.timeEntry.findMany({
        where: {
          endedAt: { not: null },
          billable: true,
          startedAt: { gte: rangeStart, lt: rangeEnd },
          project: { clientId: client.id, billable: true },
          invoiceTime: { is: null },
        },
        include: {
          project: { select: { id: true, name: true, clientId: true } },
          user: { select: { id: true, name: true } },
        },
      });
      const rateRows = await tx.billRate.findMany();
      const rates = rateRows.flatMap((row) => {
        const record = toRate(row);
        return record ? [record] : [];
      });
      const slices: InvoiceSlice[] = rows.map((row) => {
        const rate = pickRate(
          rates,
          {
            projectId: row.projectId,
            clientId: row.project.clientId,
            userId: row.userId,
            startedAt: row.startedAt,
          },
          timeZone,
        );
        const duration = entryDurationMs(row);
        let rateMinor: number | null = null;
        let unratedReason: InvoiceSlice["unratedReason"] = null;
        if (!rate) unratedReason = "no-rate";
        else if (rate.currency !== client.currency) unratedReason = "currency";
        else rateMinor = rate.amountMinor;
        return {
          timeEntryId: row.id,
          projectId: row.projectId,
          projectName: row.project.name,
          userId: row.userId,
          userName: row.user?.name ?? "Unknown member",
          day: zonedParts(row.startedAt, timeZone).date,
          durationMs: duration,
          rateMinor,
          unratedReason,
        };
      });
      const built = buildInvoiceLines({
        grouping: input.grouping,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        slices,
      });
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
              unitPriceMinor: line.unitPriceMinor,
              amountMinor: line.amountMinor,
            })),
          },
        },
        include: { lines: { orderBy: { position: "asc" } } },
      });
      for (const line of invoice.lines) {
        const source = built.lines[line.position];
        if (!source || source.timeEntryIds.length === 0) continue;
        await tx.invoiceTime.createMany({
          data: source.timeEntryIds.map((timeEntryId) => ({
            timeEntryId,
            invoiceId: invoice.id,
            invoiceLineId: line.id,
          })),
        });
      }
      return {
        ok: true as const,
        id: invoice.id,
        number: invoice.number,
        unrated: built.unrated,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(invoiceCopy.timeTaken);
    if (error instanceof Error && error.message === "Amount is too large.") {
      return fail(invoiceCopy.amountTooLarge);
    }
    throw error;
  }
}

export async function saveDraft(input: { actor: InvoiceActor; id: string; draft: DraftWrite; issue: boolean }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  try {
    return await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.id },
        include: { lines: { include: { timeLinks: true } } },
      });
      if (!invoice) return fail(invoiceCopy.notFound);
      if (invoice.status !== "draft") return fail(invoiceCopy.notDraft);
      const keptIds = new Set(input.draft.lines.flatMap((line) => (line.id ? [line.id] : [])));
      const existing = new Map(invoice.lines.map((line) => [line.id, line]));
      for (const id of keptIds) {
        if (!existing.has(id)) return fail(invoiceCopy.notDraft);
      }
      let totals: ReturnType<typeof invoiceTotals>;
      try {
        totals = invoiceTotals({
          lineAmounts: input.draft.lines.map((line) => line.amountMinor),
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

      for (let position = 0; position < input.draft.lines.length; position += 1) {
        const line = input.draft.lines[position];
        if (!line) continue;
        if (line.id) {
          const prior = existing.get(line.id);
          if (!prior) return fail(invoiceCopy.notDraft);
          await tx.invoiceLine.update({
            where: { id: line.id },
            data: {
              position,
              title: line.title,
              detail: line.detail,
              quantitySeconds: line.quantitySeconds,
              unitPriceMinor: line.unitPriceMinor,
              amountMinor: line.amountMinor,
            },
          });
        } else {
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              position,
              kind: "custom",
              title: line.title,
              detail: line.detail,
              quantitySeconds: line.quantitySeconds,
              unitPriceMinor: line.unitPriceMinor,
              amountMinor: line.amountMinor,
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
      return { ok: true as const, issued: input.issue };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(invoiceCopy.timeTaken);
    throw error;
  }
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
  const rows = await prisma.timeEntry.findMany({
    where: {
      endedAt: { not: null },
      billable: true,
      startedAt: { gte: zonedDayStart(start, timeZone), lt: zonedDayEnd(end, timeZone) },
      project: { clientId: invoice.clientId, billable: true },
      invoiceTime: { is: null },
    },
    include: {
      project: { select: { id: true, name: true, clientId: true } },
      user: { select: { name: true } },
    },
  });
  const rateRows = await prisma.billRate.findMany();
  const rates = rateRows.flatMap((row) => {
    const record = toRate(row);
    return record ? [record] : [];
  });
  const slices: InvoiceSlice[] = rows.map((row) => {
    const rate = pickRate(
      rates,
      {
        projectId: row.projectId,
        clientId: row.project.clientId,
        userId: row.userId,
        startedAt: row.startedAt,
      },
      timeZone,
    );
    let rateMinor: number | null = null;
    let unratedReason: InvoiceSlice["unratedReason"] = null;
    if (!rate) unratedReason = "no-rate";
    else if (rate.currency !== invoice.currency) unratedReason = "currency";
    else rateMinor = rate.amountMinor;
    return {
      timeEntryId: row.id,
      projectId: row.projectId,
      projectName: row.project.name,
      userId: row.userId,
      userName: row.user?.name ?? "Unknown member",
      day: zonedParts(row.startedAt, timeZone).date,
      durationMs: entryDurationMs(row),
      rateMinor,
      unratedReason,
    };
  });
  return buildInvoiceLines({ grouping: "period", periodStart: start, periodEnd: end, slices }).unrated;
}

export function parseDraftFromForm(formData: FormData, currency: string) {
  const ids = formData.getAll("lineId").map(String);
  const titles = formData.getAll("lineTitle").map(String);
  const details = formData.getAll("lineDetail").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const prices = formData.getAll("lineUnitPrice").map(String);
  const count = Math.max(ids.length, titles.length, quantities.length, prices.length);
  const lines = Array.from({ length: count }, (_, index) => ({
    id: ids[index] ?? "",
    title: titles[index] ?? "",
    detail: details[index] ?? "",
    quantity: quantities[index] ?? "",
    unitPrice: prices[index] ?? "",
  })).filter((line) => line.title.trim() || line.quantity.trim() || line.unitPrice.trim() || line.id.trim());
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
    },
    currency,
  );
}

export function invoiceDateKey(value: Date) {
  return civilDate(value);
}

export type { InvoiceStatus };

function entryDurationMs(row: { startedAt: Date; endedAt: Date | null }) {
  if (!row.endedAt) return 0;
  return Math.max(0, row.endedAt.getTime() - row.startedAt.getTime());
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
