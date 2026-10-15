import { DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from "@/lib/currencies";
import { prisma } from "@/lib/db";
import { parseRateInput, sumMoney, type MoneyTotal } from "@/lib/money";
import { rateCodes, rateCopy, type RateCode } from "@/lib/rate-copy";
import {
  attachRates,
  portionAmount,
  portionIsUnrated,
  utcDateKey,
  type BillRateRecord,
  type BillRateScope,
} from "@/lib/rates";
import { isRealCalendarDate, isValidTimeZone } from "@/lib/time-zone";
import { canSeeMoney } from "@/lib/users-validation";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace-time";

export { DEFAULT_TIME_ZONE };

const WORKSPACE_ID = "workspace";

export type RateFailure = { ok: false; code: RateCode; error: string };
export type RateSuccess = { ok: true };
export type RateResult = RateSuccess | RateFailure;

function fail(code: RateCode, error: string): RateFailure {
  return { ok: false, code, error };
}

export async function getWorkspaceCurrency(): Promise<CurrencyCode> {
  const row = await prisma.workspaceSettings.findUnique({ where: { id: WORKSPACE_ID } });
  if (row && isCurrencyCode(row.defaultCurrency)) return row.defaultCurrency;
  const created = await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: {
      id: WORKSPACE_ID,
      defaultCurrency: DEFAULT_CURRENCY,
      timeZone: DEFAULT_TIME_ZONE,
    },
  });
  return isCurrencyCode(created.defaultCurrency) ? created.defaultCurrency : DEFAULT_CURRENCY;
}

export async function setWorkspaceCurrency(currency: string): Promise<RateResult> {
  if (!isCurrencyCode(currency)) return fail(rateCodes.CURRENCY_INVALID, rateCopy.currencyRequired);
  await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: { defaultCurrency: currency },
    create: { id: WORKSPACE_ID, defaultCurrency: currency, timeZone: DEFAULT_TIME_ZONE },
  });
  return { ok: true };
}

export async function getWorkspaceTimeZone(): Promise<string> {
  const row = await prisma.workspaceSettings.findUnique({ where: { id: WORKSPACE_ID } });
  if (row && isValidTimeZone(row.timeZone)) return row.timeZone;
  const created = await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: {
      id: WORKSPACE_ID,
      defaultCurrency: DEFAULT_CURRENCY,
      timeZone: DEFAULT_TIME_ZONE,
    },
  });
  return isValidTimeZone(created.timeZone) ? created.timeZone : DEFAULT_TIME_ZONE;
}

export async function setWorkspaceTimeZone(timeZone: string): Promise<RateResult> {
  const zone = timeZone.trim();
  if (!isValidTimeZone(zone)) return fail(rateCodes.TIMEZONE_INVALID, rateCopy.timezoneInvalid);
  await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: { timeZone: zone },
    create: { id: WORKSPACE_ID, defaultCurrency: DEFAULT_CURRENCY, timeZone: zone },
  });
  return { ok: true };
}

function toRecord(row: {
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

export async function listAllBillRates(): Promise<BillRateRecord[]> {
  const rows = await prisma.billRate.findMany();
  return rows.flatMap((row) => {
    const record = toRecord(row);
    return record ? [record] : [];
  });
}

export type RateHistoryItem = {
  id: string;
  userName: string | null;
  amountMinor: number;
  currency: string;
  effectiveFrom: string;
  createdAt: Date;
};

export async function listRateHistory(input: {
  scope: BillRateScope;
  clientId?: string;
  projectId?: string;
}): Promise<RateHistoryItem[]> {
  const rows = await prisma.billRate.findMany({
    where: {
      scope: input.scope,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    userName: row.scope === "member" ? (row.user?.name ?? null) : null,
    amountMinor: row.amountMinor,
    currency: row.currency,
    effectiveFrom: utcDateKey(row.effectiveFrom),
    createdAt: row.createdAt,
  }));
}

function parseEffectiveFrom(value: string): { ok: true; date: Date } | RateFailure {
  const date = value.trim();
  if (!isRealCalendarDate(date)) return fail(rateCodes.RATE_DATE_INVALID, rateCopy.dateInvalid);
  const year = Number(date.slice(0, 4));
  if (year < 2000 || year > 2100) return fail(rateCodes.RATE_DATE_INVALID, rateCopy.dateInvalid);
  return { ok: true, date: new Date(`${date}T00:00:00.000Z`) };
}

async function insertRate(input: {
  scope: BillRateScope;
  clientId: string | null;
  projectId: string | null;
  userId: string | null;
  amountMinor: number;
  currency: string;
  effectiveFrom: Date;
  createdById: string;
}) {
  await prisma.billRate.create({ data: input });
}

export async function saveClientRate(input: {
  clientId: string;
  amountRaw: string;
  effectiveFrom: string;
  createdById: string;
}): Promise<RateResult> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { currency: true },
  });
  if (!client) return fail(rateCodes.RATE_NOT_FOUND, rateCopy.clientGone);
  if (!isCurrencyCode(client.currency)) {
    return fail(rateCodes.CURRENCY_INVALID, rateCopy.currencyRequired);
  }
  const amount = parseRateInput(input.amountRaw, client.currency);
  if (!amount.ok) return fail(amount.code, amount.error);
  const date = parseEffectiveFrom(input.effectiveFrom);
  if (!date.ok) return date;
  await insertRate({
    scope: "client",
    clientId: input.clientId,
    projectId: null,
    userId: null,
    amountMinor: amount.amountMinor,
    currency: client.currency,
    effectiveFrom: date.date,
    createdById: input.createdById,
  });
  return { ok: true };
}

export async function saveProjectRate(input: {
  projectId: string;
  amountRaw: string;
  effectiveFrom: string;
  createdById: string;
}): Promise<RateResult> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { client: { select: { id: true, currency: true } } },
  });
  if (!project) return fail(rateCodes.RATE_NOT_FOUND, rateCopy.projectGone);
  if (!project.client) return fail(rateCodes.RATE_CLIENT_REQUIRED, rateCopy.clientRequired);
  if (!isCurrencyCode(project.client.currency)) {
    return fail(rateCodes.CURRENCY_INVALID, rateCopy.currencyRequired);
  }
  const amount = parseRateInput(input.amountRaw, project.client.currency);
  if (!amount.ok) return fail(amount.code, amount.error);
  const date = parseEffectiveFrom(input.effectiveFrom);
  if (!date.ok) return date;
  await insertRate({
    scope: "project",
    clientId: project.client.id,
    projectId: input.projectId,
    userId: null,
    amountMinor: amount.amountMinor,
    currency: project.client.currency,
    effectiveFrom: date.date,
    createdById: input.createdById,
  });
  return { ok: true };
}

export async function saveMemberRate(input: {
  clientId: string;
  userId: string;
  amountRaw: string;
  effectiveFrom: string;
  createdById: string;
}): Promise<RateResult> {
  if (!input.userId.trim()) return fail(rateCodes.RATE_MEMBER_REQUIRED, rateCopy.memberRequired);
  const [client, member] = await Promise.all([
    prisma.client.findUnique({
      where: { id: input.clientId },
      select: { currency: true },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, deactivatedAt: true },
    }),
  ]);
  if (!client) return fail(rateCodes.RATE_NOT_FOUND, rateCopy.clientGone);
  if (!member || member.deactivatedAt) return fail(rateCodes.RATE_NOT_FOUND, rateCopy.memberGone);
  if (!isCurrencyCode(client.currency)) {
    return fail(rateCodes.CURRENCY_INVALID, rateCopy.currencyRequired);
  }
  const amount = parseRateInput(input.amountRaw, client.currency);
  if (!amount.ok) return fail(amount.code, amount.error);
  const date = parseEffectiveFrom(input.effectiveFrom);
  if (!date.ok) return date;
  await insertRate({
    scope: "member",
    clientId: input.clientId,
    projectId: null,
    userId: member.id,
    amountMinor: amount.amountMinor,
    currency: client.currency,
    effectiveFrom: date.date,
    createdById: input.createdById,
  });
  return { ok: true };
}

export async function summarizeBillableMoney(
  filter: { projectId?: string; clientId?: string },
  role: string,
): Promise<{ totals: MoneyTotal[]; unrated: boolean } | null> {
  if (!canSeeMoney(role)) return null;
  const rows = await prisma.timeEntry.findMany({
    where: {
      endedAt: { not: null },
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.clientId ? { project: { clientId: filter.clientId } } : {}),
    },
    select: {
      startedAt: true,
      endedAt: true,
      billable: true,
      userId: true,
      projectId: true,
      project: { select: { billable: true, clientId: true } },
    },
  });
  if (rows.length === 0) return { totals: [], unrated: false };
  const [rates, timeZone] = await Promise.all([listAllBillRates(), getWorkspaceTimeZone()]);
  const priced = attachRates(role, rows.map((row) => ({
    projectId: row.projectId,
    clientId: row.project.clientId,
    userId: row.userId,
    startedAt: row.startedAt,
    projectBillable: row.project.billable,
    entryBillable: row.billable,
    endedAt: row.endedAt,
  })), rates, timeZone);
  let unrated = false;
  const amounts = priced.map((entry) => {
    const durationMs = entry.endedAt
      ? Math.max(0, entry.endedAt.getTime() - entry.startedAt.getTime())
      : 0;
    const slice = {
      projectBillable: entry.projectBillable,
      entryBillable: entry.entryBillable,
      durationMs,
      rate: entry.rate,
    };
    if (portionIsUnrated(slice)) unrated = true;
    return portionAmount(slice);
  });
  return { totals: sumMoney(amounts), unrated };
}
