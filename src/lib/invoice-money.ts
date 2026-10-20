import { minorDigits } from "@/lib/currencies";
import { addCalendarDays, formatCivilDate, weekdayIndex } from "@/lib/time-zone";

const PERCENT_DENOMINATOR = BigInt(10_000);
export const MAX_MONEY_MINOR = 2_147_483_647;
export const MAX_QUANTITY_SECONDS = 500_000 * 3_600;

const MONEY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  LKR: "LKR ",
  AUD: "A$",
  CAD: "C$",
};

export type DiscountKind = "none" | "amount" | "percent";

/**
 * `bps` is basis points of a percent: 10% is 1000, 8.5% is 850, 100% is 10000.
 * Half a minor unit rounds away from zero. The inputs are integers.
 */
export function percentOfMinor(amountMinor: number, bps: number) {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(bps)) {
    throw new Error("Percent math requires integers.");
  }
  if (amountMinor <= 0 || bps <= 0) return 0;
  if (bps > 10_000) throw new Error("Percent cannot exceed 100.");
  const rounded =
    (BigInt(amountMinor) * BigInt(bps) + PERCENT_DENOMINATOR / BigInt(2)) / PERCENT_DENOMINATOR;
  if (rounded > BigInt(MAX_MONEY_MINOR)) {
    throw new Error("Amount is too large.");
  }
  return Number(rounded);
}

export function invoiceTotals(input: {
  lineAmounts: number[];
  discountKind: DiscountKind;
  discountAmountMinor: number;
  discountBps: number;
  taxEnabled: boolean;
  taxRateBps: number;
}) {
  const subtotalMinor = input.lineAmounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > MAX_MONEY_MINOR) {
    throw new Error("Amount is too large.");
  }
  let discountMinor = 0;
  if (input.discountKind === "percent") {
    discountMinor = percentOfMinor(subtotalMinor, input.discountBps);
  } else if (input.discountKind === "amount") {
    discountMinor = input.discountAmountMinor;
  }
  if (discountMinor > subtotalMinor) discountMinor = subtotalMinor;
  const taxable = subtotalMinor - discountMinor;
  const taxMinor = input.taxEnabled ? percentOfMinor(taxable, input.taxRateBps) : 0;
  const totalMinor = taxable + taxMinor;
  if (totalMinor > MAX_MONEY_MINOR) throw new Error("Amount is too large.");
  return { subtotalMinor, discountMinor, taxMinor, totalMinor };
}

/** Nearest second, half away from zero (up for these positive durations). */
export function secondsFromMs(totalMs: number) {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return 0;
  return Math.floor((totalMs + 500) / 1000);
}

export function formatDurationHms(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

/** `26:22:12` or `26:22` (seconds default to 0). */
export function parseDurationInput(raw: string): { ok: true; seconds: number } | { ok: false } {
  const trimmed = raw.trim();
  const match = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
  if (!match) return { ok: false };
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isSafeInteger(total) || total > MAX_QUANTITY_SECONDS) return { ok: false };
  return { ok: true, seconds: total };
}

const ZERO = BigInt(0);
const TWO = BigInt(2);
const TEN = BigInt(10);
const HALF_SECOND_MS = BigInt(500);
const SECOND_MS = BigInt(1000);
const HOUR_MS = BigInt(3_600_000);
const HOUR_SCALE = BigInt(100_000);

export function quantityMsFromSeconds(seconds: number) {
  return BigInt(seconds) * SECOND_MS;
}

/**
 * Milliseconds are the stored quantity. A row written before `quantityMs`
 * existed, or a fixture that only set `quantitySeconds`, still has the default
 * 0. Fall back to the seconds column in that case. A real sub-second quantity
 * has a non-zero `quantityMs` even when the rounded second is 0.
 */
export function resolveQuantityMs(line: { quantitySeconds: number; quantityMs?: bigint | string | null }) {
  const raw = line.quantityMs;
  const quantityMs = typeof raw === "string" && /^\d+$/.test(raw) ? BigInt(raw) : typeof raw === "bigint" ? raw : null;
  if (typeof quantityMs === "bigint" && (quantityMs !== ZERO || line.quantitySeconds === 0)) {
    return quantityMs;
  }
  return quantityMsFromSeconds(line.quantitySeconds);
}

/** Nearest second, half away from zero. Matches `secondsFromMs`. */
export function wholeSecondsFromQuantityMs(quantityMs: bigint) {
  if (quantityMs <= ZERO) return 0;
  const seconds = (quantityMs + HALF_SECOND_MS) / SECOND_MS;
  if (seconds > BigInt(MAX_QUANTITY_SECONDS)) throw new Error("Amount is too large.");
  return Number(seconds);
}

/**
 * Hourly price × duration, rounded half away from zero to the minor unit.
 * `amount = round(unitPriceMinor × quantityMs / 3_600_000)`.
 * This is `billAmountMinor` for a duration in milliseconds. A whole number of
 * seconds (`quantityMs = quantitySeconds × 1000`) matches `lineAmountMinor`.
 */
export function lineAmountFromMs(unitPriceMinor: number, quantityMs: bigint) {
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error("Hourly rates must be a non-negative integer of minor units.");
  }
  if (quantityMs <= ZERO || unitPriceMinor <= 0) return 0;
  const rounded = (BigInt(unitPriceMinor) * quantityMs + HOUR_MS / TWO) / HOUR_MS;
  if (rounded > BigInt(MAX_MONEY_MINOR)) throw new Error("Amount is too large.");
  return Number(rounded);
}

export function lineAmountMinor(unitPriceMinor: number, quantitySeconds: number) {
  if (quantitySeconds <= 0 || unitPriceMinor <= 0) return 0;
  return lineAmountFromMs(unitPriceMinor, quantityMsFromSeconds(quantitySeconds));
}

/**
 * Hours as `H:MM:SS`, `H:MM` (seconds default to 0), or a plain number of hours.
 * A plain number allows at most five decimal places. Five places is the limit
 * that still converts to an integer number of milliseconds: one hour is
 * 3,600,000 ms, and 3,600,000 is divisible by 100,000, so `0.00001` hour is
 * exactly 36 ms. The parse uses integer arithmetic, not a binary float.
 * `1.5` is exactly `1:30:00`. `1.25` is exactly `1:15:00`.
 */
export function parseQuantityInput(raw: string): { ok: true; ms: bigint; seconds: number } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed.includes(":")) {
    const parsed = parseDurationInput(trimmed);
    if (!parsed.ok) return { ok: false };
    return { ok: true, ms: quantityMsFromSeconds(parsed.seconds), seconds: parsed.seconds };
  }
  if (!/^\d+(\.\d{1,5})?$/.test(trimmed)) return { ok: false };
  const [whole, frac = ""] = trimmed.split(".");
  const scale = TEN ** BigInt(frac.length);
  const numerator = BigInt(whole) * scale + BigInt(frac || "0");
  const ms = (numerator * HOUR_MS) / scale;
  if ((numerator * HOUR_MS) % scale !== ZERO) return { ok: false };
  if (ms > BigInt(MAX_QUANTITY_SECONDS) * SECOND_MS) return { ok: false };
  try {
    return { ok: true, ms, seconds: wholeSecondsFromQuantityMs(ms) };
  } catch {
    return { ok: false };
  }
}

/** `H:MM:SS` when the milliseconds are a whole number of seconds, otherwise decimal hours. */
export function formatQuantityMs(quantityMs: bigint) {
  if (quantityMs <= ZERO) return formatDurationHms(0);
  if (quantityMs % SECOND_MS === ZERO) {
    const seconds = quantityMs / SECOND_MS;
    if (seconds > BigInt(Number.MAX_SAFE_INTEGER)) return formatDurationHms(MAX_QUANTITY_SECONDS);
    return formatDurationHms(Number(seconds));
  }
  const whole = quantityMs / HOUR_MS;
  const remainder = quantityMs % HOUR_MS;
  const scale = HOUR_SCALE;
  const digits = (remainder * scale) / HOUR_MS;
  const fraction = digits.toString().padStart(5, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function invoiceLineQuantity(line: { quantitySeconds: number; quantityMs?: bigint | string | null }) {
  return formatQuantityMs(resolveQuantityMs(line));
}

/** A manual date range replaces the free-text detail on the page and the PDF. */
export function invoiceLineDetail(line: { detail: string; rangeStart?: string | null; rangeEnd?: string | null }) {
  if (line.rangeStart && line.rangeEnd) return formatInvoiceRange(line.rangeStart, line.rangeEnd);
  return line.detail;
}

export function formatPercentBps(bps: number) {
  const negative = bps < 0;
  const abs = Math.abs(bps);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  const body =
    frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0").replace(/0+$/, "")}`;
  return `${negative ? "-" : ""}${body}%`;
}

/**
 * A percentage with at most two decimal places, from 0 to 100.
 * "8.5" is 850 basis points. "10" is 1000.
 */
export function parsePercentBps(raw: string): { ok: true; bps: number } | { ok: false } {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > 2) return { ok: false };
  const bps = Number(`${whole}${frac.padEnd(2, "0")}`);
  if (!Number.isInteger(bps) || bps > 10_000) return { ok: false };
  return { ok: true, bps };
}

export function formatInvoiceDate(date: string) {
  return formatCivilDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatInvoiceRange(start: string, end: string) {
  return `${formatInvoiceDate(start)} - ${formatInvoiceDate(end)}`;
}

/** Monday through Sunday uses the reference title. Any other span is "Invoice". */
export function periodLineTitle(start: string, end: string) {
  if (weekdayIndex(start) === 1 && addCalendarDays(start, 6) === end && weekdayIndex(end) === 0) {
    return "Weekly Invoice";
  }
  return "Invoice";
}

/** `$659.25`, `¥1,500`. Other currencies keep the ISO code. No float math. */
export function formatInvoiceMoney(amountMinor: number, currency: string) {
  const digits = minorDigits(currency) ?? 2;
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const scale = 10 ** digits;
  const whole = digits === 0 ? abs : Math.trunc(abs / scale);
  const fraction = digits === 0 ? 0 : abs % scale;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = digits === 0 ? grouped : `${grouped}.${String(fraction).padStart(digits, "0")}`;
  const symbol = MONEY_SYMBOLS[currency];
  const prefix = symbol ?? `${currency} `;
  return `${negative ? "-" : ""}${prefix}${body}`;
}

export function amountDueMinor(totalMinor: number, paidMinor: number) {
  return Math.max(0, totalMinor - paidMinor);
}
