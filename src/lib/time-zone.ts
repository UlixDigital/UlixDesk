const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const TIME_ZONE_COOKIE = "ulixdesk-timezone";

export function isValidTimeZone(timeZone: string) {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isRealCalendarDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isRealClockTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59;
}

/** Weekday of a civil date. The same calendar date is the same weekday everywhere. */
export function weekdayIndex(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return formatIsoDate(shifted);
}

export function startOfWeekDate(date: string) {
  const index = weekdayIndex(date);
  const delta = index === 0 ? -6 : 1 - index;
  return addCalendarDays(date, delta);
}

export function weekDates(date: string) {
  const start = startOfWeekDate(date);
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
}

export type ZonedParts = {
  date: string;
  time: string;
  hour: string;
  minute: string;
  second: string;
};

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = new Map(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  let hour = map.get("hour") ?? "00";
  let day = Number(map.get("day"));
  let month = Number(map.get("month"));
  let year = Number(map.get("year"));
  if (hour === "24") {
    hour = "00";
    const rolled = new Date(Date.UTC(year, month - 1, day + 1, 12));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  const minute = (map.get("minute") ?? "00").padStart(2, "0");
  const second = (map.get("second") ?? "00").padStart(2, "0");
  const date = formatIsoNumbers(year, month, day);
  return {
    date,
    time: `${hour.padStart(2, "0")}:${minute}`,
    hour: hour.padStart(2, "0"),
    minute,
    second,
  };
}

function timeZoneOffsetMs(instantMs: number, timeZone: string) {
  const parts = zonedParts(new Date(instantMs), timeZone);
  const [year, month, day] = parts.date.split("-").map(Number);
  const asUtc = Date.UTC(
    year,
    month - 1,
    day,
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instantMs;
}

/**
 * UTC instant for a civil date and clock time in `timeZone`.
 * Returns null when the local time does not exist (a spring-forward gap).
 * When a local time happens twice (a fall-back overlap), returns the earlier instant.
 */
export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date | null {
  if (!isValidTimeZone(timeZone) || !isRealCalendarDate(date) || !isRealClockTime(time)) {
    return null;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = desiredUtc - timeZoneOffsetMs(desiredUtc, timeZone);
  instant = desiredUtc - timeZoneOffsetMs(instant, timeZone);

  const matches = (ms: number) => {
    const parts = zonedParts(new Date(ms), timeZone);
    return parts.date === date && parts.time === time;
  };

  const hits = [instant - 3_600_000, instant, instant + 3_600_000].filter(matches);
  if (hits.length === 0) return null;
  return new Date(Math.min(...hits));
}

export function zonedDayStart(date: string, timeZone: string) {
  const instant = zonedDateTimeToUtc(date, "00:00", timeZone);
  if (!instant) {
    throw new Error(`Cannot resolve the start of ${date} in ${timeZone}.`);
  }
  return instant;
}

export function zonedDayEnd(date: string, timeZone: string) {
  return zonedDayStart(addCalendarDays(date, 1), timeZone);
}

export function todayInTimeZone(timeZone: string, now = new Date()) {
  return zonedParts(now, timeZone).date;
}

export function formatCivilDate(
  date: string,
  options: Intl.DateTimeFormatOptions,
) {
  const [year, month, day] = date.split("-").map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(noon);
}

export function formatZonedTime(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

export function weekdayShort(date: string) {
  return WEEKDAY_SHORT[weekdayIndex(date)];
}

function formatIsoDate(date: Date) {
  return formatIsoNumbers(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function formatIsoNumbers(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
