import { budgetCopy, budgetNoAmount } from "@/lib/budget-copy";
import { billAmountMinor, formatMoney } from "@/lib/money";
import {
  addCalendarDays,
  formatCivilDate,
  isRealCalendarDate,
  startOfWeekDate,
  todayInTimeZone,
  zonedDayEnd,
  zonedDayStart,
} from "@/lib/time-zone";

export const budgetRecurrences = ["total", "weekly", "monthly"] as const;
export type BudgetRecurrence = (typeof budgetRecurrences)[number];

export const budgetBases = ["hours", "cost"] as const;
export type BudgetBasis = (typeof budgetBases)[number];

export const HOURS_AMOUNT_MAX = 100_000;

export type BudgetWindow = {
  /** Inclusive instant. Null counts from the beginning of time. */
  startMs: number | null;
  /** Exclusive instant. Null has no end. */
  endMs: number | null;
  /** Today is before the start date, so nothing in this period counts yet. */
  notStarted: boolean;
  /** Inclusive calendar date, when the window has a start. */
  from: string | null;
  /** Inclusive calendar date, when the window has an end. */
  to: string | null;
};

export type BudgetSpec = {
  basis: BudgetBasis;
  /** Hours: seconds. Cost: minor units. */
  amount: number;
  currency: string | null;
  recurrence: BudgetRecurrence;
  /** Calendar date, or null. */
  startsOn: string | null;
  billableOnly: boolean;
  alertPercent: number | null;
  hardStop: boolean;
};

export type BudgetEntrySlice = {
  startedAtMs: number;
  endedAtMs: number;
  /** Project is billable and the entry is billable. */
  billable: boolean;
  rateMinor: number | null;
  rateCurrency: string | null;
};

export type BudgetUse = {
  includedMs: number;
  costMinor: number;
  unrated: boolean;
  notStarted: boolean;
};

export type BudgetFigures = {
  budgetLabel: string;
  usedLabel: string;
  remainingLabel: string;
  percentLabel: string;
  /** Tenths of a percent. Null when cost is unrated, so the screen shows —. */
  percentTenths: number | null;
  warning: boolean;
  reached: boolean;
  unrated: boolean;
  blocks: boolean;
  notStarted: boolean;
};

export function isBudgetRecurrence(value: string): value is BudgetRecurrence {
  return (budgetRecurrences as readonly string[]).includes(value);
}

export function isBudgetBasis(value: string): value is BudgetBasis {
  return (budgetBases as readonly string[]).includes(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthStart(date: string) {
  return `${date.slice(0, 4)}-${date.slice(5, 7)}-01`;
}

function nextMonthStart(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${pad(month + 1)}-01`;
}

function emptyWindow(startsOn: string): BudgetWindow {
  return {
    startMs: null,
    endMs: null,
    notStarted: true,
    from: startsOn,
    to: null,
  };
}

/**
 * The instants that count toward a budget right now.
 * Weeks are Monday through Sunday. Months are calendar months.
 * Both are evaluated in `timeZone`, not UTC.
 */
export function budgetWindow(input: {
  recurrence: BudgetRecurrence;
  startsOn: string | null;
  timeZone: string;
  now: Date;
}): BudgetWindow {
  const today = todayInTimeZone(input.timeZone, input.now);
  const startsOn = input.startsOn;
  if (startsOn && today < startsOn) return emptyWindow(startsOn);

  if (input.recurrence === "total") {
    return {
      startMs: startsOn ? zonedDayStart(startsOn, input.timeZone).getTime() : null,
      endMs: null,
      notStarted: false,
      from: startsOn,
      to: null,
    };
  }

  const periodFrom =
    input.recurrence === "weekly" ? startOfWeekDate(today) : monthStart(today);
  const periodTo =
    input.recurrence === "weekly"
      ? addCalendarDays(periodFrom, 6)
      : addCalendarDays(nextMonthStart(today), -1);
  if (startsOn && startsOn > periodTo) return emptyWindow(startsOn);
  const from = startsOn && startsOn > periodFrom ? startsOn : periodFrom;
  return {
    startMs: zonedDayStart(from, input.timeZone).getTime(),
    endMs: zonedDayEnd(periodTo, input.timeZone).getTime(),
    notStarted: false,
    from,
    to: periodTo,
  };
}

/** Overlap of a completed entry with the window. The end instant is exclusive. */
export function overlapMs(
  startedAtMs: number,
  endedAtMs: number,
  window: BudgetWindow,
) {
  if (window.notStarted) return 0;
  if (endedAtMs <= startedAtMs) return 0;
  const start = Math.max(startedAtMs, window.startMs ?? Number.NEGATIVE_INFINITY);
  const end = Math.min(endedAtMs, window.endMs ?? Number.POSITIVE_INFINITY);
  return Math.max(0, end - start);
}

/**
 * Hours sum the overlap. Cost sums bill amounts in the budget currency only.
 * Billable time with no rate, or a rate in another currency, is unrated.
 * Non-billable time is not unrated. A billable-only budget ignores it.
 */
export function measureBudgetUse(
  spec: Pick<BudgetSpec, "basis" | "currency" | "billableOnly">,
  entries: BudgetEntrySlice[],
  window: BudgetWindow,
): BudgetUse {
  if (window.notStarted) {
    return { includedMs: 0, costMinor: 0, unrated: false, notStarted: true };
  }
  let includedMs = 0;
  let costMinor = 0;
  let unrated = false;
  for (const entry of entries) {
    const ms = overlapMs(entry.startedAtMs, entry.endedAtMs, window);
    if (ms <= 0) continue;
    if (spec.billableOnly && !entry.billable) continue;
    if (spec.basis === "hours") {
      includedMs += ms;
      continue;
    }
    if (!entry.billable) continue;
    includedMs += ms;
    if (entry.rateMinor === null || entry.rateCurrency !== spec.currency) {
      unrated = true;
      continue;
    }
    costMinor += billAmountMinor(entry.rateMinor, ms);
  }
  return { includedMs, costMinor, unrated, notStarted: false };
}

function percentTenths(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Number((BigInt(Math.max(0, Math.trunc(used))) * BigInt(1000)) / BigInt(limit));
}

function crosses(used: number, limit: number, percent: number) {
  if (limit <= 0) return false;
  return BigInt(Math.max(0, Math.trunc(used))) * BigInt(100) >= BigInt(limit) * BigInt(percent);
}

/** Hundredths of an hour, half up. Exact hours stay exact. */
export function formatBudgetHours(ms: number) {
  const negative = ms < 0;
  const abs = Math.abs(Math.trunc(ms));
  const hundredths = Math.floor((abs + 18_000) / 36_000);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${negative ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

export function formatBudgetPercent(used: number, limit: number) {
  if (limit <= 0) return budgetNoAmount;
  const tenths = percentTenths(used, limit);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? `${whole}%` : `${whole}.${frac}%`;
}

export function hoursWithUnit(ms: number) {
  return `${formatBudgetHours(ms)} ${budgetCopy.hoursUnit}`;
}

function dateLabel(date: string) {
  return formatCivilDate(date, { month: "short", day: "numeric", year: "numeric" });
}

export function budgetPeriodLabel(input: {
  recurrence: BudgetRecurrence;
  startsOn: string | null;
  window: BudgetWindow;
}) {
  const name =
    input.recurrence === "total"
      ? budgetCopy.recurrenceTotal
      : input.recurrence === "weekly"
        ? budgetCopy.recurrenceWeekly
        : budgetCopy.recurrenceMonthly;
  if (input.window.notStarted && input.startsOn) {
    return `${name} · starts ${dateLabel(input.startsOn)}`;
  }
  if (input.recurrence === "total") {
    return input.startsOn ? `${name} · from ${dateLabel(input.startsOn)}` : name;
  }
  if (input.window.from && input.window.to) {
    return `${name} · ${dateLabel(input.window.from)} – ${dateLabel(input.window.to)}`;
  }
  return name;
}

export function budgetFigures(spec: BudgetSpec, use: BudgetUse): BudgetFigures {
  const limit = spec.basis === "hours" ? spec.amount * 1000 : spec.amount;
  const used = spec.basis === "hours" ? use.includedMs : use.costMinor;
  const reached = !use.notStarted && used >= limit && limit > 0;
  const warning =
    !use.notStarted &&
    spec.alertPercent !== null &&
    crosses(used, limit, spec.alertPercent);
  const unrated = spec.basis === "cost" && use.unrated;
  const percentKnown = !unrated && !use.notStarted;
  const remaining = Math.max(0, limit - used);
  const budgetLabel =
    spec.basis === "hours"
      ? hoursWithUnit(limit)
      : formatMoney(spec.amount, spec.currency ?? "");
  let usedLabel = budgetNoAmount;
  let remainingLabel = budgetNoAmount;
  if (use.notStarted) {
    usedLabel = spec.basis === "hours" ? hoursWithUnit(0) : formatMoney(0, spec.currency ?? "");
    remainingLabel = budgetLabel;
  } else if (spec.basis === "hours") {
    usedLabel = hoursWithUnit(used);
    remainingLabel = hoursWithUnit(remaining);
  } else if (!unrated) {
    usedLabel = formatMoney(used, spec.currency ?? "");
    remainingLabel = formatMoney(remaining, spec.currency ?? "");
  } else if (use.costMinor > 0) {
    usedLabel = `${formatMoney(use.costMinor, spec.currency ?? "")} ${budgetNoAmount}`;
  }
  return {
    budgetLabel,
    usedLabel,
    remainingLabel,
    percentLabel: percentKnown ? formatBudgetPercent(used, limit) : budgetNoAmount,
    percentTenths: percentKnown ? percentTenths(used, limit) : null,
    warning: warning || reached,
    reached,
    unrated,
    blocks: spec.hardStop && reached,
    notStarted: use.notStarted,
  };
}

export function budgetStatus(figures: BudgetFigures) {
  if (figures.notStarted) return budgetCopy.statusNotStarted;
  if (figures.reached) return budgetCopy.statusReached;
  if (figures.unrated) return budgetCopy.statusNoRate;
  if (figures.warning) return budgetCopy.statusAlert;
  return budgetCopy.statusOnTrack;
}

/** Decimal hours, up to two places, stored as whole seconds. */
export function parseHoursAmount(
  raw: string,
): { ok: true; seconds: number } | { ok: false } {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > 2) return { ok: false };
  const hours = Number(whole);
  const hundredths = Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(hours) || hours > HOURS_AMOUNT_MAX) return { ok: false };
  const seconds = hours * 3600 + hundredths * 36;
  if (seconds <= 0 || seconds > HOURS_AMOUNT_MAX * 3600) return { ok: false };
  return { ok: true, seconds };
}

export function formatHoursInput(seconds: number) {
  const hundredths = Math.floor(seconds / 36);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

export function parseAlertPercent(raw: string): { ok: true; percent: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, percent: null };
  if (!/^\d{1,2}$/.test(trimmed)) return { ok: false };
  const percent = Number(trimmed);
  if (percent < 1 || percent > 99) return { ok: false };
  return { ok: true, percent };
}

export function parseBudgetStart(raw: string): { ok: true; startsOn: string | null } | { ok: false; range: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, startsOn: null };
  if (!isRealCalendarDate(trimmed)) return { ok: false, range: false };
  const year = Number(trimmed.slice(0, 4));
  if (year < 2000 || year > 2100) return { ok: false, range: true };
  return { ok: true, startsOn: trimmed };
}
