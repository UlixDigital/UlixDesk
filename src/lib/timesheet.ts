import { countLabel } from "@/lib/client-display";
import { LONG_OVERNIGHT_MS, longOvernightWarning, timeCopy } from "@/lib/time-copy";
import {
  addCalendarDays,
  formatCivilDate,
  formatZonedTime,
  startOfWeekDate,
  weekDates,
  weekdayShort,
  zonedDayEnd,
  zonedDayStart,
} from "@/lib/time-zone";

export type TimesheetView = "day" | "week";

export type TimesheetEntry = {
  id: string;
  projectId: string;
  projectName: string;
  projectArchived: boolean;
  clientId: string | null;
  clientName: string | null;
  startedAt: Date;
  endedAt: Date;
  billable: boolean;
  note: string | null;
  source: "manual" | "timer";
};

export type RunningDailyEntry = {
  id: string;
  projectId: string;
  projectName: string;
  projectArchived: boolean;
  clientName: string | null;
  startLabel: string;
  startedAt: string;
  billable: boolean;
  note: string | null;
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
};

export type DailyRow = {
  id: string;
  projectId: string;
  projectName: string;
  projectArchived: boolean;
  clientName: string | null;
  startLabel: string;
  endLabel: string;
  durationMs: number;
  billable: boolean;
  note: string | null;
  source: "manual" | "timer";
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
};

export type WeeklyRow = {
  projectId: string;
  projectName: string;
  projectArchived: boolean;
  clientName: string | null;
  dayMs: number[];
  continuesFromPrevious: boolean[];
  continuesToNext: boolean[];
  totalMs: number;
};

export type TimesheetNotice = "overlap" | "running";

export function parseTimesheetView(value: string | undefined): TimesheetView {
  return value === "week" ? "week" : "day";
}

export function parseNotice(value: string | undefined): TimesheetNotice | null {
  if (value === "overlap" || value === "running") return value;
  return null;
}

export function timesheetsHref(input: {
  view?: TimesheetView;
  date?: string;
  projectId?: string;
  clientId?: string;
  notice?: TimesheetNotice | null;
} = {}) {
  const params = new URLSearchParams();
  if (input.view === "week") params.set("view", "week");
  if (input.date) params.set("date", input.date);
  if (input.projectId) params.set("project", input.projectId);
  if (input.clientId) params.set("client", input.clientId);
  if (input.notice) params.set("notice", input.notice);
  const query = params.toString();
  return query ? `/timesheets?${query}` : "/timesheets";
}

export function newTimeEntryHref(date: string, projectId = "") {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (projectId) params.set("project", projectId);
  const query = params.toString();
  return query ? `/timesheets/new?${query}` : "/timesheets/new";
}

export function portionMs(
  startedAt: Date,
  endedAt: Date,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const start = Math.max(startedAt.getTime(), rangeStart.getTime());
  const end = Math.min(endedAt.getTime(), rangeEnd.getTime());
  return Math.max(0, end - start);
}

/**
 * Short overnight rolls keep “Ends the next day”.
 * A roll longer than 12 hours warns with the real duration instead.
 * Saving stays allowed either way.
 */
export function overnightDurationNotice(endsNextDay: boolean, durationMs: number | null) {
  if (!endsNextDay || durationMs === null || durationMs <= 0) {
    return { hint: null, warning: null };
  }
  if (durationMs > LONG_OVERNIGHT_MS) {
    return {
      hint: null,
      warning: longOvernightWarning(formatTrackedDuration(durationMs)),
    };
  }
  return { hint: timeCopy.endsNextDay, warning: null };
}

export function formatTrackedDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatElapsed(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function entryCountLabel(count: number) {
  return countLabel(count, "entry", "entries");
}

export function timesheetEmptyCopy(input: {
  view: TimesheetView;
  filtered: boolean;
}) {
  if (input.filtered) {
    return {
      title: timeCopy.filterEmptyTitle,
      body:
        input.view === "week" ? timeCopy.weeklyFilterBody : timeCopy.dailyFilterBody,
      clearLabel: timeCopy.clearFilters,
    };
  }
  if (input.view === "week") {
    return {
      title: timeCopy.weeklyEmptyTitle,
      body: timeCopy.weeklyEmptyBody,
      clearLabel: null,
    };
  }
  return {
    title: timeCopy.dailyEmptyTitle,
    body: timeCopy.dailyEmptyBody,
    clearLabel: null,
  };
}

export function formatDayHeading(date: string) {
  return formatCivilDate(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatWeekHeading(date: string) {
  const dates = weekDates(date);
  const start = formatCivilDate(dates[0], { month: "short", day: "numeric" });
  const end = formatCivilDate(dates[6], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

export function formatWeekdayLabel(date: string) {
  return {
    weekday: weekdayShort(date),
    day: formatCivilDate(date, { month: "short", day: "numeric" }),
  };
}

export function buildDailyTimesheet(input: {
  date: string;
  timeZone: string;
  entries: TimesheetEntry[];
}) {
  const dayStart = zonedDayStart(input.date, input.timeZone);
  const dayEnd = zonedDayEnd(input.date, input.timeZone);
  const rows: DailyRow[] = [];

  for (const entry of input.entries) {
    const durationMs = portionMs(entry.startedAt, entry.endedAt, dayStart, dayEnd);
    if (durationMs <= 0) continue;
    const segmentStart = new Date(
      Math.max(entry.startedAt.getTime(), dayStart.getTime()),
    );
    const segmentEnd = new Date(
      Math.min(entry.endedAt.getTime(), dayEnd.getTime()),
    );
    rows.push({
      id: entry.id,
      projectId: entry.projectId,
      projectName: entry.projectName,
      projectArchived: entry.projectArchived,
      clientName: entry.clientName,
      startLabel: formatZonedTime(segmentStart, input.timeZone),
      endLabel: formatZonedTime(segmentEnd, input.timeZone),
      durationMs,
      billable: entry.billable,
      note: entry.note,
      source: entry.source,
      continuesFromPrevious: entry.startedAt < dayStart,
      continuesToNext: entry.endedAt > dayEnd,
    });
  }

  rows.sort((a, b) => {
    const aStart = input.entries.find((entry) => entry.id === a.id);
    const bStart = input.entries.find((entry) => entry.id === b.id);
    const byTime =
      (aStart?.startedAt.getTime() ?? 0) - (bStart?.startedAt.getTime() ?? 0);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });

  return {
    totalMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
    rows,
  };
}

export function buildWeeklyTimesheet(input: {
  date: string;
  timeZone: string;
  entries: TimesheetEntry[];
}) {
  const dates = weekDates(input.date);
  const ranges = dates.map((day) => ({
    start: zonedDayStart(day, input.timeZone),
    end: zonedDayEnd(day, input.timeZone),
  }));
  const grouped = new Map<string, WeeklyRow>();

  for (const entry of input.entries) {
    const dayMs = ranges.map((range) =>
      portionMs(entry.startedAt, entry.endedAt, range.start, range.end),
    );
    const added = dayMs.reduce((sum, value) => sum + value, 0);
    if (added <= 0) continue;
    const continuesFromPrevious = dayMs.map(
      (value, index) => value > 0 && entry.startedAt < ranges[index].start,
    );
    const continuesToNext = dayMs.map(
      (value, index) => value > 0 && entry.endedAt > ranges[index].end,
    );
    const existing = grouped.get(entry.projectId);
    if (!existing) {
      grouped.set(entry.projectId, {
        projectId: entry.projectId,
        projectName: entry.projectName,
        projectArchived: entry.projectArchived,
        clientName: entry.clientName,
        dayMs,
        continuesFromPrevious,
        continuesToNext,
        totalMs: added,
      });
      continue;
    }
    existing.dayMs = existing.dayMs.map((value, index) => value + dayMs[index]);
    existing.continuesFromPrevious = existing.continuesFromPrevious.map(
      (value, index) => value || continuesFromPrevious[index],
    );
    existing.continuesToNext = existing.continuesToNext.map(
      (value, index) => value || continuesToNext[index],
    );
    existing.totalMs += added;
  }

  const rows = [...grouped.values()].sort((a, b) => {
    const byName = a.projectName.localeCompare(b.projectName, "en", {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.projectId.localeCompare(b.projectId);
  });
  const columnTotals = dates.map((_, index) =>
    rows.reduce((sum, row) => sum + row.dayMs[index], 0),
  );

  return {
    dates,
    weekStart: startOfWeekDate(input.date),
    rows,
    columnTotals,
    totalMs: columnTotals.reduce((sum, value) => sum + value, 0),
  };
}

export function shiftTimesheetDate(date: string, view: TimesheetView, by: number) {
  return addCalendarDays(date, view === "week" ? by * 7 : by);
}

type RunningSource = {
  id: string;
  projectId: string;
  projectName: string;
  projectArchived: boolean;
  clientId: string | null;
  clientName: string | null;
  startedAt: Date;
  billable: boolean;
  note: string | null;
};

/** The running timer when it overlaps this local day and the active filters. Totals stay separate. */
export function runningEntryForDay(input: {
  date: string;
  timeZone: string;
  now: Date;
  entry: RunningSource | null;
  projectId?: string;
  clientId?: string;
}): RunningDailyEntry | null {
  const entry = input.entry;
  if (!entry) return null;
  if (input.projectId && entry.projectId !== input.projectId) return null;
  if (input.clientId && entry.clientId !== input.clientId) return null;
  const dayStart = zonedDayStart(input.date, input.timeZone);
  const dayEnd = zonedDayEnd(input.date, input.timeZone);
  if (!(entry.startedAt < dayEnd && input.now >= dayStart)) return null;
  return {
    id: entry.id,
    projectId: entry.projectId,
    projectName: entry.projectName,
    projectArchived: entry.projectArchived,
    clientName: entry.clientName,
    startLabel: formatZonedTime(entry.startedAt, input.timeZone),
    startedAt: entry.startedAt.toISOString(),
    billable: entry.billable,
    note: entry.note,
    continuesFromPrevious: entry.startedAt < dayStart,
    continuesToNext: input.now > dayEnd,
  };
}
