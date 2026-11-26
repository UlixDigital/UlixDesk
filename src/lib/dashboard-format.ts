import { dashboardCopy } from "@/lib/dashboard-copy";
import { formatCivilDate, weekDates, weekdayShort } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";

/** Owners and admins land on the dashboard. Everyone else keeps the clients page. */
export function dashboardLandingPath(role: string | null | undefined) {
  return canManageWorkspace(role ?? "") ? "/dashboard" : "/clients";
}

export type OnlineMember = {
  userId: string;
  name: string;
  initial: string;
  working: boolean;
  projectName: string | null;
  clientName: string | null;
  detail: string | null;
  todayMs: number;
  weekMs: number;
  /** Milliseconds for Monday through Sunday of the current workspace week. */
  weekBars: number[];
};

export type ProjectActivity = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  ms: number;
};

export type DashboardPayload = {
  timeZone: string;
  generatedAt: string;
  weekLabel: string;
  /** The last 7 workspace dates, oldest first, ending today. */
  sparklineDates: string[];
  /** Monday through Sunday of the current workspace week. */
  weekDates: string[];
  summary: {
    workedTodayMs: number;
    workedTodayDeltaMs: number;
    workedTodaySparkline: number[];
    projectsWorked: number;
    projectsDelta: number;
    projectsSparkline: number[];
    workedWeekMs: number;
    workedWeekDeltaMs: number;
    workedWeekSparkline: number[];
  };
  online: OnlineMember[];
  projects: ProjectActivity[];
};

/** `H:MM:SS`. Hours are not zero-padded, so 90 minutes is `1:30:00`. */
export function formatClock(ms: number) {
  const safe = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function deltaDirection(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * `down 15:21:02 vs yesterday` for a duration, or `down 2 vs last week` for a count.
 * A zero change keeps the amount and drops the direction word.
 */
export function formatPeriodDelta(
  delta: number,
  kind: "duration" | "count",
  comparedTo: "yesterday" | "last week",
) {
  const compared = comparedTo === "yesterday" ? dashboardCopy.vsYesterday : dashboardCopy.vsLastWeek;
  const amount = kind === "count" ? String(Math.abs(Math.trunc(delta))) : formatClock(Math.abs(delta));
  if (delta > 0) return `${dashboardCopy.up} ${amount} ${compared}`;
  if (delta < 0) return `${dashboardCopy.down} ${amount} ${compared}`;
  return `${amount} ${compared}`;
}

export function formatLastUpdated(elapsedMs: number) {
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  if (seconds < 10) return dashboardCopy.lastUpdatedJustNow;
  if (seconds < 60) return dashboardCopy.lastUpdatedAgo(`${seconds} seconds`);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return dashboardCopy.lastUpdatedAgo(minutes === 1 ? "1 minute" : `${minutes} minutes`);
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return dashboardCopy.lastUpdatedAgo(hours === 1 ? "1 hour" : `${hours} hours`);
  }
  const days = Math.floor(hours / 24);
  return dashboardCopy.lastUpdatedAgo(days === 1 ? "1 day" : `${days} days`);
}

export function nameInitial(name: string) {
  const char = name.trim().charAt(0);
  return char ? char.toUpperCase() : "?";
}

export function weekRangeLabel(weekStart: string) {
  const days = weekDates(weekStart);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${formatCivilDate(days[0] ?? weekStart, options)} – ${formatCivilDate(days[6] ?? weekStart, options)}`;
}

export function seriesLabel(title: string, values: number[], kind: "duration" | "count") {
  const body = values
    .map((value) => (kind === "count" ? String(value) : formatClock(value)))
    .join(", ");
  return `${title}, last 7 days: ${body}`;
}

export function weekBarsLabel(dates: string[], values: number[]) {
  return dates
    .map((date, index) => `${weekdayShort(date)} ${formatClock(values[index] ?? 0)}`)
    .join(", ");
}
