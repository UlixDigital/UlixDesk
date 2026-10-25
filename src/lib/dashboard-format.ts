import { canManageWorkspace } from "@/lib/users-validation";
import { formatCivilDate, weekDates } from "@/lib/time-zone";

export type DashboardScope = "me" | "all";

export type DashboardPayload = {
  scope: DashboardScope;
  canChooseScope: boolean;
  showMoney: boolean;
  timeZone: string;
  serverNow: number;
  runningTimers: number;
  weekLabel: string;
  kpis: {
    workedTodayMs: number;
    workedTodayDeltaMs: number;
    workedWeekMs: number;
    workedWeekDeltaMs: number;
    todaySparkline: number[];
    weekSparkline: number[];
    online: number;
    teamSize: number;
    /** People with time today, minus people with time yesterday. */
    onlineDelta: number;
    onlineSparkline: number[];
    projectsWorked: number;
    projectsDelta: number;
    projectsSparkline: number[];
  };
  online: OnlinePerson[];
  workedToday: WorkedPerson[];
  days: Array<{ date: string; label: string; ms: number }>;
  projects: ProjectRow[];
  team: TeamRow[];
  budgets: BudgetRow[];
};

export type OnlinePerson = {
  userId: string;
  name: string;
  initial: string;
  color: string;
  projectName: string;
  projectInitial: string;
  projectColor: string;
  todoTitle: string | null;
  startedAt: string;
  startedLabel: string;
};

export type WorkedPerson = {
  userId: string;
  name: string;
  initial: string;
  color: string;
  ms: number;
  projectName: string | null;
  projectInitial: string | null;
  projectColor: string | null;
  todoTitle: string | null;
  online: boolean;
};

export type ProjectRow = {
  id: string;
  name: string;
  initial: string;
  color: string;
  ms: number;
  sharePercent: number;
  topTodo: string | null;
  todos: Array<{ id: string; title: string; ms: number }>;
};

export type TeamRow = {
  userId: string;
  name: string;
  initial: string;
  color: string;
  todayMs: number;
  weekMs: number;
  running: boolean;
};

export type BudgetRow = {
  id: string;
  name: string;
  initial: string;
  color: string;
  typeLabel: string;
  basis: "hours" | "cost";
  spentLabel: string;
  budgetLabel: string;
  progressPercent: number | null;
};

const BADGE_COLORS = [
  "#16a34a",
  "#c026d3",
  "#ea580c",
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#e11d48",
  "#0284c7",
];

export function badgeColor(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33 + key.charCodeAt(index)) >>> 0;
  }
  return BADGE_COLORS[hash % BADGE_COLORS.length] ?? BADGE_COLORS[0];
}

export function nameInitial(name: string) {
  const char = name.trim().charAt(0);
  return char ? char.toUpperCase() : "?";
}

/** `H:MM:SS`. Hours are not zero-padded, so 90 minutes is `1:30:00`. */
export function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** `H:MM` for chart labels and team hours. */
export function formatHm(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function deltaDirection(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

export function weekRangeLabel(weekStart: string) {
  const days = weekDates(weekStart);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${formatCivilDate(days[0] ?? weekStart, options)} - ${formatCivilDate(days[6] ?? weekStart, options)}`;
}

export function budgetTypeLabel(recurrence: string) {
  if (recurrence === "weekly") return "Weekly";
  if (recurrence === "monthly") return "Monthly";
  return "Fixed";
}

/**
 * Owners and admins default to the whole team. Members are always `me`.
 * An explicit `all` request from a member is rejected.
 */
export function resolveDashboardScope(
  role: string,
  requested: string | null | undefined,
): { ok: true; scope: DashboardScope } | { ok: false } {
  const value = (requested ?? "").trim().toLowerCase();
  const manager = canManageWorkspace(role);
  if (value === "all") {
    if (!manager) return { ok: false };
    return { ok: true, scope: "all" };
  }
  if (value === "me") return { ok: true, scope: "me" };
  return { ok: true, scope: manager ? "all" : "me" };
}

export const EIGHT_HOUR_MS = 8 * 60 * 60 * 1000;

export function dailyProgressPercent(ms: number) {
  if (ms <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((ms * 100) / EIGHT_HOUR_MS)));
}
