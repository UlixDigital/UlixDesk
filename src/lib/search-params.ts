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

/**
 * Keep a real calendar date inside 2000-01-01 through 2100-12-31.
 * Anything earlier, including years 0001–0099, becomes 2000-01-01.
 * Anything later becomes 2100-12-31. The month and day are not kept.
 * Returns null when `value` is not a real `YYYY-MM-DD` date.
 */
export function clampCalendarDate(value: string): string | null {
  const trimmed = value.trim();
  if (!isRealCalendarDate(trimmed)) return null;
  if (trimmed < `${SEARCH_YEAR_MIN}-01-01`) return `${SEARCH_YEAR_MIN}-01-01`;
  if (trimmed > `${SEARCH_YEAR_MAX}-12-31`) return `${SEARCH_YEAR_MAX}-12-31`;
  return trimmed;
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
