import { invoiceCopy } from "@/lib/invoice-copy";
import { parseRateInput } from "@/lib/money";
import { isRealCalendarDate } from "@/lib/time-zone";

export const paymentMethods = ["bank_transfer", "card", "cash", "check", "other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const agingBuckets = ["current", "d1", "d31", "d61", "d91"] as const;
export type AgingBucket = (typeof agingBuckets)[number];

const NOTE_MAX = 500;

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (paymentMethods as readonly string[]).includes(value);
}

export function paymentMethodLabel(method: string | null | undefined) {
  switch (method) {
    case "bank_transfer":
      return invoiceCopy.methodBank;
    case "card":
      return invoiceCopy.methodCard;
    case "cash":
      return invoiceCopy.methodCash;
    case "check":
      return invoiceCopy.methodCheck;
    case "other":
      return invoiceCopy.methodOther;
    default:
      return method?.trim() || "—";
  }
}

/** Whole calendar days from `earlier` to `later`. Negative when `later` is first. */
export function calendarDaysBetween(earlier: string, later: string) {
  const [y1, m1, d1] = earlier.split("-").map(Number);
  const [y2, m2, d2] = later.split("-").map(Number);
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(ms / 86_400_000);
}

/** Days after the due date. Zero means due today. Negative means not yet due. */
export function daysPastDue(dueDate: string, asOf: string) {
  return calendarDaysBetween(dueDate, asOf);
}

/**
 * Current is not yet due, including due on the as-of date (0 days).
 * 1–30, 31–60, and 61–90 are inclusive. 91 days and later is 90+.
 */
export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "d1";
  if (days <= 60) return "d31";
  if (days <= 90) return "d61";
  return "d91";
}

export function emptyAgingBuckets(): Record<AgingBucket, number> {
  return { current: 0, d1: 0, d31: 0, d61: 0, d91: 0 };
}

/** The due date has passed and a balance remains. Due today is not overdue. */
export function isOverdue(input: { dueDate: string; today: string; dueMinor: number }) {
  return input.dueMinor > 0 && input.today > input.dueDate;
}

/**
 * Paid plus amount due equals the total whenever the payment is not above
 * the total. Overpayment is refused, so this is the stored invariant.
 */
export function invoiceBalance(totalMinor: number, paidMinor: number) {
  const dueMinor = totalMinor - paidMinor;
  return {
    totalMinor,
    paidMinor,
    dueMinor,
    balanced: paidMinor + dueMinor === totalMinor && paidMinor <= totalMinor && dueMinor >= 0,
  };
}

/** A fully covered invoice is paid. Any remaining balance, including zero payments, stays open. */
export function statusForPayments(totalMinor: number, paidMinor: number): "open" | "paid" {
  if (totalMinor > 0 && paidMinor === totalMinor) return "paid";
  return "open";
}

function dateOk(value: string) {
  if (!isRealCalendarDate(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function parsePaymentInput(input: {
  amount: string;
  currency: string;
  paidOn: string;
  method: string;
  note: string;
}):
  | { ok: true; amountMinor: number; paidOn: string; method: PaymentMethod; note: string | null }
  | { ok: false; error: string } {
  const parsed = parseRateInput(input.amount, input.currency);
  if (!parsed.ok) return { ok: false, error: invoiceCopy.paymentAmountInvalid };
  if (parsed.amountMinor <= 0) return { ok: false, error: invoiceCopy.paymentAmountZero };
  if (!dateOk(input.paidOn.trim())) return { ok: false, error: invoiceCopy.dateInvalid };
  if (!isPaymentMethod(input.method)) return { ok: false, error: invoiceCopy.paymentMethodInvalid };
  const note = input.note.replace(/\u0000/g, "").trim();
  if (note.length > NOTE_MAX) return { ok: false, error: invoiceCopy.paymentNoteTooLong };
  return {
    ok: true,
    amountMinor: parsed.amountMinor,
    paidOn: input.paidOn.trim(),
    method: input.method,
    note: note || null,
  };
}
