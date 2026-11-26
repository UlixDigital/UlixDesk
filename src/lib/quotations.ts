import { Prisma } from "@prisma/client";
import { isCurrencyCode } from "@/lib/currencies";
import { prisma } from "@/lib/db";
import { civilDate, dateColumn } from "@/lib/invoice-form";
import { invoiceTotals } from "@/lib/invoice-money";
import { allocateInvoiceNumber, ensureWorkspace } from "@/lib/invoices";
import { formatQuotationNumber } from "@/lib/quotation-number";
import { QUOTATION_VALID_MONTHS, quotationCopy } from "@/lib/quotation-copy";
import { invoiceFieldsFromQuotationLine } from "@/lib/quotation-lines";
import { quotationDateColumn, type QuotationDraftWrite } from "@/lib/quotation-form";
import { quotationStatusWhere } from "@/lib/quotation-status";
import { addCalendarDays, addCalendarMonths, startOfWeekDate, todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace-time";

const WORKSPACE_ID = "workspace";

type Tx = Prisma.TransactionClient;

export type QuotationActor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: quotationCopy.denied };
}

function fail(error: string) {
  return { ok: false as const, error };
}

export async function allocateQuotationNumber(tx: Tx) {
  await ensureWorkspace(tx);
  await tx.$queryRaw`SELECT "id" FROM "WorkspaceSettings" WHERE "id" = ${WORKSPACE_ID} FOR UPDATE`;
  const settings = await tx.workspaceSettings.findUniqueOrThrow({ where: { id: WORKSPACE_ID } });
  let next = settings.nextQuotationNumber;
  const prefix = settings.quotationPrefix;
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const number = formatQuotationNumber(prefix, next);
    const taken = await tx.quotationNumber.findUnique({ where: { number }, select: { number: true } });
    if (!taken) {
      await tx.quotationNumber.create({ data: { number } });
      await tx.workspaceSettings.update({
        where: { id: WORKSPACE_ID },
        data: { nextQuotationNumber: next + 1 },
      });
      return number;
    }
    next += 1;
  }
  throw new Error("Could not allocate a quotation number.");
}

const quotationInclude = {
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
  lines: { orderBy: { position: "asc" as const } },
  invoice: { select: { id: true, number: true } },
  statusEvents: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { name: true } } },
  },
  emailsSent: {
    orderBy: { createdAt: "desc" as const },
    include: { sentBy: { select: { name: true } } },
  },
} as const;

export type QuotationDetail = Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>;

export function quotationDateKey(value: Date) {
  return civilDate(value);
}

export async function getQuotation(actorRole: string, id: string) {
  if (!canManageWorkspace(actorRole)) return null;
  return prisma.quotation.findUnique({ where: { id }, include: quotationInclude });
}

export async function quotationForInvoice(actorRole: string, invoiceId: string) {
  if (!canManageWorkspace(actorRole)) return null;
  return prisma.quotation.findUnique({
    where: { invoiceId },
    select: { id: true, number: true },
  });
}

export async function listQuotations(
  actorRole: string,
  filters: { clientId?: string; status?: string; from?: string; to?: string; number?: string },
  today: string,
) {
  if (!canManageWorkspace(actorRole)) return [];
  const number = filters.number?.trim();
  const status = filters.status ? quotationStatusWhere(filters.status, today) : null;
  return prisma.quotation.findMany({
    where: {
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(status ? { status: status.status } : {}),
      ...(status?.validUntil
        ? {
            validUntil:
              "lt" in status.validUntil
                ? { lt: dateColumn(status.validUntil.lt) }
                : { gte: dateColumn(status.validUntil.gte) },
          }
        : {}),
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
    include: {
      client: { select: { id: true, name: true } },
      lines: { orderBy: { position: "asc" as const }, select: { title: true, detail: true } },
    },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
  });
}

export async function listQuotationClients() {
  const rows = await prisma.client.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, currency: true },
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

function lineCreate(lines: QuotationDraftWrite["lines"]) {
  return lines.map((line, position) => ({
    position,
    quantityKind: line.quantityKind,
    title: line.title,
    detail: line.detail,
    quantitySeconds: line.quantitySeconds,
    quantityMs: line.quantityMs,
    rangeStart: line.rangeStart ? quotationDateColumn(line.rangeStart) : null,
    rangeEnd: line.rangeEnd ? quotationDateColumn(line.rangeEnd) : null,
    unitPriceMinor: line.unitPriceMinor,
    amountMinor: line.amountMinor,
  }));
}

function totalsFor(draft: Pick<QuotationDraftWrite, "lines" | "taxEnabled" | "taxRateBps">) {
  return invoiceTotals({
    lineAmounts: draft.lines.map((line) => line.amountMinor),
    discountKind: "none",
    discountAmountMinor: 0,
    discountBps: 0,
    taxEnabled: draft.taxEnabled,
    taxRateBps: draft.taxRateBps,
  });
}

export async function createQuotation(input: { actor: QuotationActor; clientId: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) return fail(quotationCopy.clientRequired);
  if (client.archivedAt) return fail(quotationCopy.clientArchived);
  if (!isCurrencyCode(client.currency)) return fail(quotationCopy.priceInvalid);

  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await ensureWorkspace(tx);
      const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
      const number = await allocateQuotationNumber(tx);
      const issueDate = todayInTimeZone(timeZone);
      const validUntil = addCalendarMonths(issueDate, QUOTATION_VALID_MONTHS);
      const totals = invoiceTotals({
        lineAmounts: [],
        discountKind: "none",
        discountAmountMinor: 0,
        discountBps: 0,
        taxEnabled: settings.invoiceTaxEnabled,
        taxRateBps: settings.invoiceTaxRateBps,
      });
      const quotation = await tx.quotation.create({
        data: {
          number,
          clientId: client.id,
          status: "draft",
          currency: client.currency,
          issueDate: dateColumn(issueDate),
          validUntil: dateColumn(validUntil),
          notes: "",
          terms: quotationCopy.defaultTerms,
          taxEnabled: settings.invoiceTaxEnabled,
          taxLabel: settings.invoiceTaxLabel,
          taxRateBps: settings.invoiceTaxRateBps,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          createdById: input.actor.id,
        },
      });
      return { ok: true as const, id: quotation.id, number: quotation.number };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Amount is too large.") return fail(quotationCopy.amountTooLarge);
    throw error;
  }
}

export async function saveQuotationDraft(input: { actor: QuotationActor; id: string; draft: QuotationDraftWrite }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Quotation" WHERE "id" = ${input.id} FOR UPDATE`;
      const quotation = await tx.quotation.findUnique({ where: { id: input.id }, select: { id: true, status: true } });
      if (!quotation) return fail(quotationCopy.notFound);
      if (quotation.status !== "draft") return fail(quotationCopy.notDraft);
      const totals = totalsFor(input.draft);
      await tx.quotationLine.deleteMany({ where: { quotationId: quotation.id } });
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          issueDate: dateColumn(input.draft.issueDate),
          validUntil: dateColumn(input.draft.validUntil),
          notes: input.draft.notes,
          terms: input.draft.terms,
          taxEnabled: input.draft.taxEnabled,
          taxLabel: input.draft.taxLabel,
          taxRateBps: input.draft.taxRateBps,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          lines: { create: lineCreate(input.draft.lines) },
        },
      });
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Amount is too large.") return fail(quotationCopy.amountTooLarge);
    throw error;
  }
}

async function recordStatus(
  tx: Tx,
  input: { id: string; actorId: string; fromStatus: string; toStatus: string; reason: string; sent?: boolean; decided?: boolean },
) {
  await tx.quotation.update({
    where: { id: input.id },
    data: {
      status: input.toStatus,
      ...(input.sent ? { sentAt: new Date() } : {}),
      ...(input.decided ? { decidedAt: new Date() } : {}),
    },
  });
  await tx.quotationStatusEvent.create({
    data: {
      quotationId: input.id,
      actorId: input.actorId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason,
    },
  });
}

export async function markQuotationSent(input: { actor: QuotationActor; id: string; reason?: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Quotation" WHERE "id" = ${input.id} FOR UPDATE`;
    const quotation = await tx.quotation.findUnique({
      where: { id: input.id },
      select: { id: true, status: true, _count: { select: { lines: true } } },
    });
    if (!quotation) return fail(quotationCopy.notFound);
    if (quotation.status !== "draft") return fail(quotationCopy.notDraft);
    if (quotation._count.lines === 0) return fail(quotationCopy.needsLines);
    await recordStatus(tx, {
      id: quotation.id,
      actorId: input.actor.id,
      fromStatus: "draft",
      toStatus: "sent",
      reason: input.reason ?? quotationCopy.sentReason,
      sent: true,
    });
    return { ok: true as const };
  });
}

export async function decideQuotation(input: { actor: QuotationActor; id: string; decision: "accepted" | "declined" }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Quotation" WHERE "id" = ${input.id} FOR UPDATE`;
    const quotation = await tx.quotation.findUnique({
      where: { id: input.id },
      select: { id: true, status: true, _count: { select: { lines: true } } },
    });
    if (!quotation) return fail(quotationCopy.notFound);
    if (quotation.status !== "draft" && quotation.status !== "sent") return fail(quotationCopy.notOpen);
    if (input.decision === "accepted" && quotation._count.lines === 0) return fail(quotationCopy.needsLines);
    await recordStatus(tx, {
      id: quotation.id,
      actorId: input.actor.id,
      fromStatus: quotation.status,
      toStatus: input.decision,
      reason: input.decision === "accepted" ? quotationCopy.acceptReason : quotationCopy.declineReason,
      decided: true,
    });
    return { ok: true as const };
  });
}

export async function duplicateQuotation(input: { actor: QuotationActor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const source = await prisma.quotation.findUnique({
    where: { id: input.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!source) return fail(quotationCopy.notFound);
  return prisma.$transaction(async (tx) => {
    const settings = await ensureWorkspace(tx);
    const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
    const number = await allocateQuotationNumber(tx);
    const issueDate = todayInTimeZone(timeZone);
    const validUntil = addCalendarMonths(issueDate, QUOTATION_VALID_MONTHS);
    const quotation = await tx.quotation.create({
      data: {
        number,
        clientId: source.clientId,
        status: "draft",
        currency: source.currency,
        issueDate: dateColumn(issueDate),
        validUntil: dateColumn(validUntil),
        notes: source.notes,
        terms: source.terms,
        taxEnabled: source.taxEnabled,
        taxLabel: source.taxLabel,
        taxRateBps: source.taxRateBps,
        subtotalMinor: source.subtotalMinor,
        taxMinor: source.taxMinor,
        totalMinor: source.totalMinor,
        createdById: input.actor.id,
        lines: {
          create: source.lines.map((line) => ({
            position: line.position,
            quantityKind: line.quantityKind,
            title: line.title,
            detail: line.detail,
            quantitySeconds: line.quantitySeconds,
            quantityMs: line.quantityMs,
            rangeStart: line.rangeStart,
            rangeEnd: line.rangeEnd,
            unitPriceMinor: line.unitPriceMinor,
            amountMinor: line.amountMinor,
          })),
        },
      },
    });
    return { ok: true as const, id: quotation.id, number: quotation.number };
  });
}

export async function convertQuotationToInvoice(input: { actor: QuotationActor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Quotation" WHERE "id" = ${input.id} FOR UPDATE`;
      const quotation = await tx.quotation.findUnique({
        where: { id: input.id },
        include: { lines: { orderBy: { position: "asc" } } },
      });
      if (!quotation) return fail(quotationCopy.notFound);
      if (quotation.status !== "accepted") return fail(quotationCopy.convertStatus);
      if (quotation.invoiceId) return fail(quotationCopy.alreadyConverted);
      if (quotation.lines.length === 0) return fail(quotationCopy.needsLines);
      const settings = await ensureWorkspace(tx);
      const timeZone = settings.timeZone || DEFAULT_TIME_ZONE;
      const number = await allocateInvoiceNumber(tx);
      const issueDate = todayInTimeZone(timeZone);
      const dueDate = addCalendarDays(issueDate, settings.invoiceNetTermsDays);
      const thisMonday = startOfWeekDate(issueDate);
      const periodStart = addCalendarDays(thisMonday, -7);
      const periodEnd = addCalendarDays(thisMonday, -1);
      const totals = invoiceTotals({
        lineAmounts: quotation.lines.map((line) => line.amountMinor),
        discountKind: "none",
        discountAmountMinor: 0,
        discountBps: 0,
        taxEnabled: quotation.taxEnabled,
        taxRateBps: quotation.taxRateBps,
      });
      const invoice = await tx.invoice.create({
        data: {
          number,
          clientId: quotation.clientId,
          status: "draft",
          currency: quotation.currency,
          issueDate: dateColumn(issueDate),
          dueDate: dateColumn(dueDate),
          periodStart: dateColumn(periodStart),
          periodEnd: dateColumn(periodEnd),
          grouping: "period",
          notes: quotation.notes,
          bankDetails: settings.invoiceBankDetails,
          taxEnabled: quotation.taxEnabled,
          taxLabel: quotation.taxLabel,
          taxRateBps: quotation.taxRateBps,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          paidMinor: 0,
          createdById: input.actor.id,
          lines: {
            create: quotation.lines.map((line) => {
              const text = invoiceFieldsFromQuotationLine(line);
              return {
                position: line.position,
                kind: "custom",
                quantityKind: line.quantityKind,
                title: text.title,
                detail: text.detail,
                quantitySeconds: line.quantitySeconds,
                quantityMs: line.quantityMs,
                rangeStart: line.rangeStart,
                rangeEnd: line.rangeEnd,
                unitPriceMinor: line.unitPriceMinor,
                amountMinor: line.amountMinor,
              };
            }),
          },
        },
      });
      await tx.quotation.update({ where: { id: quotation.id }, data: { invoiceId: invoice.id } });
      return { ok: true as const, invoiceId: invoice.id, number: invoice.number };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Amount is too large.") return fail(quotationCopy.amountTooLarge);
    throw error;
  }
}
