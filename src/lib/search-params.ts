import { isRealCalendarDate } from "@/lib/time-zone";

/** Inclusive year bounds for report and time-edit dates. Year 10000 cannot be resolved. */
export const SEARCH_YEAR_MIN = 2000;
export const SEARCH_YEAR_MAX = 2100;

/**
 * The first value when a query key is repeated (`action=a&action=b`).
 * Next.js hands that case to a page as a string array. Calling string
 * methods on the array throws and the page returns 500.
 */
export function firstSearchParam(value: string | string[] | undefined | null): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Keep a real calendar date inside 2000–2100.
 * `9999-12-31` becomes `2100-12-31`. A day that does not exist in the
 * clamped year (29 Feb 2100) moves back to the last day of that month.
 * Returns null when `value` is not a real `YYYY-MM-DD` date.
 */
export function clampCalendarDate(value: string): string | null {
  const trimmed = value.trim();
  if (!isRealCalendarDate(trimmed)) return null;
  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(5, 7));
  const day = Number(trimmed.slice(8, 10));
  const clampedYear = Math.min(SEARCH_YEAR_MAX, Math.max(SEARCH_YEAR_MIN, year));
  if (clampedYear === year) return trimmed;
  const lastDay = new Date(Date.UTC(clampedYear, month, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  const result = `${clampedYear}-${pad(month)}-${pad(clampedDay)}`;
  return isRealCalendarDate(result) ? result : null;
}

/** A date query param, or `fallback` when it is missing or not a real date. */
export function parseBoundedDate(
  value: string | string[] | undefined | null,
  fallback: string,
): string {
  const clamped = clampCalendarDate(firstSearchParam(value));
  return clamped ?? fallback;
}

/** Page numbers start at 1. Anything else, including a repeated key, uses the first value. */
export function parsePageParam(value: string | string[] | undefined | null): number {
  const page = Number(firstSearchParam(value));
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function parseEnumParam<T extends string>(
  value: string | string[] | undefined | null,
  allowed: readonly T[],
): T | null {
  const trimmed = firstSearchParam(value);
  return (allowed as readonly string[]).includes(trimmed) ? (trimmed as T) : null;
}
