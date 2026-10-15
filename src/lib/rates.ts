import { canSeeMoney } from "@/lib/users-validation";
import { billAmountMinor, type MoneyTotal } from "@/lib/money";
import { zonedParts } from "@/lib/time-zone";

export type BillRateScope = "client" | "project" | "member";

export type BillRateRecord = {
  id: string;
  scope: BillRateScope;
  clientId: string | null;
  projectId: string | null;
  userId: string | null;
  amountMinor: number;
  currency: string;
  effectiveFrom: Date;
  createdAt: Date;
};

export type ResolvedRate = {
  amountMinor: number;
  currency: string;
};

export type RateSubject = {
  projectId: string;
  clientId: string | null;
  userId: string | null;
  startedAt: Date;
};

/**
 * Civil date stored on a bill rate. Prisma returns a `@db.Date` as UTC midnight,
 * so this is the calendar date, not the workspace-local date of an instant.
 */
export function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** A rate starts at 00:00 in `timeZone` on its effective calendar date. */
export function rateCovers(effectiveFrom: Date, startedAt: Date, timeZone: string) {
  return utcDateKey(effectiveFrom) <= zonedParts(startedAt, timeZone).date;
}

function preferred(current: BillRateRecord | null, candidate: BillRateRecord) {
  if (!current) return candidate;
  const byDate = utcDateKey(candidate.effectiveFrom).localeCompare(utcDateKey(current.effectiveFrom));
  if (byDate > 0) return candidate;
  if (byDate < 0) return current;
  const byCreated = candidate.createdAt.getTime() - current.createdAt.getTime();
  if (byCreated > 0) return candidate;
  if (byCreated < 0) return current;
  return candidate.id > current.id ? candidate : current;
}

function latest(rows: BillRateRecord[]) {
  return rows.reduce<BillRateRecord | null>((winner, row) => preferred(winner, row), null);
}

/**
 * Project rate, then member rate for that client, then the client rate.
 * The row used is the latest effectiveFrom on or before the entry's calendar
 * date in `timeZone`. Two rows with the same date: the later save wins.
 * A missing rate is null, which is not the same as an explicit zero.
 */
export function pickRate(
  rates: BillRateRecord[],
  entry: RateSubject,
  timeZone: string,
): BillRateRecord | null {
  const applicable = rates.filter((rate) => rateCovers(rate.effectiveFrom, entry.startedAt, timeZone));
  const project = latest(
    applicable.filter((rate) => rate.scope === "project" && rate.projectId === entry.projectId),
  );
  if (project) return project;
  if (entry.clientId && entry.userId) {
    const member = latest(
      applicable.filter(
        (rate) =>
          rate.scope === "member" &&
          rate.clientId === entry.clientId &&
          rate.userId === entry.userId,
      ),
    );
    if (member) return member;
  }
  if (entry.clientId) {
    const client = latest(
      applicable.filter(
        (rate) =>
          rate.scope === "client" &&
          rate.clientId === entry.clientId &&
          rate.projectId === null &&
          rate.userId === null,
      ),
    );
    if (client) return client;
  }
  return null;
}

export function toResolvedRate(rate: BillRateRecord | null): ResolvedRate | null {
  if (!rate) return null;
  return { amountMinor: rate.amountMinor, currency: rate.currency };
}

/**
 * Members receive no rate, even if the caller passed the rate table.
 * That keeps amounts out of the UI, API payloads built from this helper, and exports.
 */
export function attachRates<T extends RateSubject>(
  role: string,
  entries: T[],
  rates: BillRateRecord[],
  timeZone: string,
): Array<T & { rate: ResolvedRate | null }> {
  if (!canSeeMoney(role)) {
    return entries.map((entry) => ({ ...entry, rate: null }));
  }
  return entries.map((entry) => ({
    ...entry,
    rate: toResolvedRate(pickRate(rates, entry, timeZone)),
  }));
}

/**
 * An entry is billed only when the project is billable and the entry is billable.
 * A non-billable project wins. No rate means no amount (null), not zero.
 * An explicit zero rate produces a zero amount.
 */
export function portionAmount(input: {
  projectBillable: boolean;
  entryBillable: boolean;
  durationMs: number;
  rate: ResolvedRate | null;
}): MoneyTotal | null {
  if (!input.projectBillable || !input.entryBillable) return null;
  if (!input.rate) return null;
  if (input.durationMs <= 0) return null;
  return {
    currency: input.rate.currency,
    amountMinor: billAmountMinor(input.rate.amountMinor, input.durationMs),
  };
}

export function portionIsUnrated(input: {
  projectBillable: boolean;
  entryBillable: boolean;
  durationMs: number;
  rate: ResolvedRate | null;
}) {
  return (
    input.durationMs > 0 &&
    input.projectBillable &&
    input.entryBillable &&
    input.rate === null
  );
}

/** Future CSV or PDF columns. Members get an empty object, so the file has no money. */
export function moneyExportFields(role: string, amount: MoneyTotal | null) {
  if (!canSeeMoney(role) || !amount) return {};
  return { currency: amount.currency, amountMinor: amount.amountMinor };
}
