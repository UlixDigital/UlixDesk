import { MAX_RATE_MINOR, minorDigits } from "@/lib/currencies";
import { amountDecimalsMessage, rateCopy } from "@/lib/rate-copy";

const HOUR_MS = BigInt(3_600_000);

export type MoneyTotal = {
  currency: string;
  amountMinor: number;
};

export type ParsedRate =
  | { ok: true; amountMinor: number }
  | { ok: false; code: "RATE_INVALID" | "RATE_TOO_PRECISE"; error: string };

/**
 * Parse a decimal amount into minor units using integer arithmetic.
 * "10" in USD is 1000. "10.5" is 1050. "1500" in JPY is 1500.
 * More fractional digits than the currency allows is rejected. Floats are not used.
 */
export function parseRateInput(raw: string, currency: string): ParsedRate {
  const digits = minorDigits(currency);
  if (digits === null) {
    return { ok: false, code: "RATE_INVALID", error: rateCopy.amountInvalid };
  }
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false, code: "RATE_INVALID", error: rateCopy.amountInvalid };
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > digits) {
    return {
      ok: false,
      code: "RATE_TOO_PRECISE",
      error: digits === 0 ? rateCopy.amountWhole : amountDecimalsMessage(digits),
    };
  }
  const minorStr = `${whole}${frac.padEnd(digits, "0")}`.replace(/^0+(?=\d)/, "");
  const amountMinor = Number(minorStr);
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_RATE_MINOR) {
    return { ok: false, code: "RATE_INVALID", error: rateCopy.amountTooLarge };
  }
  return { ok: true, amountMinor };
}

export function moneyPlaceholder(currency: string) {
  const digits = minorDigits(currency);
  if (digits === null || digits === 0) return "0";
  return `0.${"0".repeat(digits)}`;
}

/** `USD 1,250.50`, `JPY 1,500`, `BHD 1.234`. Grouped with commas. No float math. */
export function formatMoney(amountMinor: number, currency: string) {
  const digits = minorDigits(currency) ?? 2;
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const scale = 10 ** digits;
  const whole = digits === 0 ? abs : Math.trunc(abs / scale);
  const fraction = digits === 0 ? 0 : abs % scale;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body =
    digits === 0 ? grouped : `${grouped}.${String(fraction).padStart(digits, "0")}`;
  return `${negative ? "-" : ""}${currency} ${body}`;
}

export function formatMoneyTotals(totals: MoneyTotal[]) {
  return totals.map((total) => formatMoney(total.amountMinor, total.currency));
}

/**
 * A spreadsheet number for one currency. No currency code and no thousands
 * separators, so the cell stays numeric. `40000` USD minor units is `400.00`.
 * `1500` JPY is `1500`.
 */
export function formatMoneyNumber(amountMinor: number, currency: string) {
  const digits = minorDigits(currency) ?? 2;
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const scale = 10 ** digits;
  const whole = digits === 0 ? abs : Math.trunc(abs / scale);
  const fraction = digits === 0 ? 0 : abs % scale;
  const body = digits === 0 ? String(whole) : `${whole}.${String(fraction).padStart(digits, "0")}`;
  return `${negative ? "-" : ""}${body}`;
}

/**
 * Hourly rate × duration, rounded half away from zero to the currency minor unit.
 * `amount = round(rateMinor × durationMs / 3_600_000)` using integer division.
 * A remainder of exactly half a minor unit rounds away from zero (up, for these
 * positive amounts). Each call rounds on its own. Summing rounded slices can
 * differ from rounding the full duration by one minor unit per extra slice.
 */
export function billAmountMinor(rateMinor: number, durationMs: number) {
  if (!Number.isInteger(rateMinor) || rateMinor < 0) {
    throw new Error("Hourly rates must be a non-negative integer of minor units.");
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const numerator = BigInt(rateMinor) * BigInt(Math.floor(durationMs));
  const rounded = (numerator + HOUR_MS / BigInt(2)) / HOUR_MS;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Bill amount is too large to calculate.");
  }
  return Number(rounded);
}

export function sumMoney(amounts: Array<MoneyTotal | null | undefined>) {
  const totals = new Map<string, number>();
  for (const amount of amounts) {
    if (!amount) continue;
    totals.set(amount.currency, (totals.get(amount.currency) ?? 0) + amount.amountMinor);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}
