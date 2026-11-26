import { Prisma } from "@prisma/client";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { prisma } from "@/lib/db";
import {
  nameInitial,
  weekRangeLabel,
  type DashboardPayload,
  type OnlineMember,
  type ProjectActivity,
} from "@/lib/dashboard-format";
import {
  addCalendarDays,
  startOfWeekDate,
  todayInTimeZone,
  weekDates,
  zonedDateTimeToUtc,
  zonedDayEnd,
  zonedDayStart,
  zonedParts,
} from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";

export { dashboardLandingPath } from "@/lib/dashboard-format";

export type DashboardEntry = {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  clientName: string | null;
  todoTitle: string | null;
  note: string | null;
  startedAtMs: number;
  endedAtMs: number;
  running: boolean;
};

export type DashboardMember = { id: string; name: string };

type TimeWindow = { start: number; end: number };

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

export function rangeOverlap(start: number, end: number, rangeStart: number, rangeEnd: number) {
  const from = Math.max(start, rangeStart);
  const to = Math.min(end, rangeEnd);
  return to > from ? to - from : 0;
}

function closedStop(entry: DashboardEntry, nowMs: number) {
  if (entry.startedAtMs >= nowMs) return entry.startedAtMs;
  const end = entry.running ? nowMs : entry.endedAtMs;
  return Math.min(Math.max(end, entry.startedAtMs), nowMs);
}

function overlap(entry: DashboardEntry, window: TimeWindow, nowMs: number) {
  return rangeOverlap(entry.startedAtMs, closedStop(entry, nowMs), window.start, window.end);
}

function sumIn(entries: DashboardEntry[], window: TimeWindow, nowMs: number) {
  let total = 0;
  for (const entry of entries) total += overlap(entry, window, nowMs);
  return total;
}

function projectsIn(entries: DashboardEntry[], window: TimeWindow, nowMs: number) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (overlap(entry, window, nowMs) > 0) ids.add(entry.projectId);
  }
  return ids;
}

/** The same local clock time on `date`, or null when that local time does not exist. */
function clockOn(date: string, now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  const minute = zonedDateTimeToUtc(date, parts.time, timeZone);
  if (!minute) return null;
  const seconds = Number(parts.second);
  return minute.getTime() + (Number.isFinite(seconds) ? seconds * 1000 : 0);
}

/**
 * End of the previous period at the same local clock time.
 * Falls back to an equal elapsed duration when that clock time does not exist.
 */
function alignedEnd(startMs: number, currentStartMs: number, nowMs: number, clockEndMs: number | null) {
  const fallback = startMs + Math.max(0, nowMs - currentStartMs);
  if (clockEndMs === null || clockEndMs < startMs) return fallback;
  if (clockEndMs - startMs > EIGHT_DAYS_MS) return fallback;
  return clockEndMs;
}

function dayWindow(date: string, timeZone: string, nowMs: number): TimeWindow {
  return {
    start: zonedDayStart(date, timeZone).getTime(),
    end: Math.min(zonedDayEnd(date, timeZone).getTime(), nowMs),
  };
}

function taskLabel(todoTitle: string | null, note: string | null) {
  const title = todoTitle?.trim() ?? "";
  if (title) return title;
  const text = note?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function clean(value: string | null) {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function isWorking(entry: DashboardEntry, nowMs: number) {
  return entry.running && entry.startedAtMs <= nowMs;
}

/** The running timer, or the entry that ended most recently. */
function focusEntry(entries: DashboardEntry[], nowMs: number) {
  let running: DashboardEntry | null = null;
  let latest: DashboardEntry | null = null;
  let latestEnd = -1;
  for (const entry of entries) {
    if (entry.startedAtMs > nowMs) continue;
    if (isWorking(entry, nowMs)) {
      if (!running || entry.startedAtMs >= running.startedAtMs) running = entry;
      continue;
    }
    const end = closedStop(entry, nowMs);
    if (end <= entry.startedAtMs) continue;
    if (!latest || end > latestEnd || (end === latestEnd && entry.startedAtMs >= latest.startedAtMs)) {
      latest = entry;
      latestEnd = end;
    }
  }
  return running ?? latest;
}

/**
 * Team totals for the owner and admin dashboard.
 * Day and week boundaries are workspace-local. A week starts on Monday.
 * "Today" is compared with yesterday up to the same local clock time, and
 * "this week" with last week up to the same weekday and clock time.
 * Sparklines are the last 7 local days, oldest first. Running timers count
 * only up to `now`.
 */
export function buildDashboard(input: {
  timeZone: string;
  now: Date;
  members: DashboardMember[];
  entries: DashboardEntry[];
}): DashboardPayload {
  const nowMs = input.now.getTime();
  const allowed = new Set(input.members.map((member) => member.id));
  const entries = input.entries.filter((entry) => allowed.has(entry.userId));
  const today = todayInTimeZone(input.timeZone, input.now);
  const yesterday = addCalendarDays(today, -1);
  const weekStart = startOfWeekDate(today);
  const lastWeekStart = addCalendarDays(weekStart, -7);
  const sparklineDates = Array.from({ length: 7 }, (_, index) => addCalendarDays(today, index - 6));
  const currentWeekDates = weekDates(today);

  const todayWindow = dayWindow(today, input.timeZone, nowMs);
  const yesterdayWindow: TimeWindow = {
    start: zonedDayStart(yesterday, input.timeZone).getTime(),
    end: alignedEnd(
      zonedDayStart(yesterday, input.timeZone).getTime(),
      todayWindow.start,
      nowMs,
      clockOn(yesterday, input.now, input.timeZone),
    ),
  };
  const weekStartMs = zonedDayStart(weekStart, input.timeZone).getTime();
  const lastWeekStartMs = zonedDayStart(lastWeekStart, input.timeZone).getTime();
  const thisWeek: TimeWindow = { start: weekStartMs, end: nowMs };
  const lastWeek: TimeWindow = {
    start: lastWeekStartMs,
    end: alignedEnd(
      lastWeekStartMs,
      weekStartMs,
      nowMs,
      clockOn(addCalendarDays(today, -7), input.now, input.timeZone),
    ),
  };

  const dailyMs = sparklineDates.map((date) => sumIn(entries, dayWindow(date, input.timeZone, nowMs), nowMs));
  const dailyProjects = sparklineDates.map(
    (date) => projectsIn(entries, dayWindow(date, input.timeZone, nowMs), nowMs).size,
  );
  const workedTodayMs = sumIn(entries, todayWindow, nowMs);
  const workedWeekMs = sumIn(entries, thisWeek, nowMs);
  const projectsWorked = projectsIn(entries, thisWeek, nowMs).size;

  const byUser = new Map<string, DashboardEntry[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) list.push(entry);
    else byUser.set(entry.userId, [entry]);
  }

  const online: OnlineMember[] = input.members
    .map((member) => {
      const own = byUser.get(member.id) ?? [];
      const focus = focusEntry(own, nowMs);
      const working = own.some((entry) => isWorking(entry, nowMs));
      return {
        userId: member.id,
        name: member.name,
        initial: nameInitial(member.name),
        working,
        projectName: focus ? clean(focus.projectName) : null,
        clientName: focus ? clean(focus.clientName) : null,
        detail: focus ? taskLabel(focus.todoTitle, focus.note) : null,
        todayMs: sumIn(own, todayWindow, nowMs),
        weekMs: sumIn(own, thisWeek, nowMs),
        weekBars: currentWeekDates.map((date) => sumIn(own, dayWindow(date, input.timeZone, nowMs), nowMs)),
      };
    })
    .sort((a, b) => {
      if (a.working !== b.working) return a.working ? -1 : 1;
      const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.userId.localeCompare(b.userId);
    });

  const projectMap = new Map<string, { name: string; clientName: string | null; ms: number }>();
  for (const entry of entries) {
    const ms = overlap(entry, thisWeek, nowMs);
    if (ms <= 0) continue;
    const row = projectMap.get(entry.projectId) ?? {
      name: clean(entry.projectName) ?? "Project",
      clientName: clean(entry.clientName),
      ms: 0,
    };
    row.ms += ms;
    if (!row.clientName) row.clientName = clean(entry.clientName);
    projectMap.set(entry.projectId, row);
  }
  const projects: ProjectActivity[] = [...projectMap.entries()]
    .map(([projectId, row]) => ({
      projectId,
      projectName: row.name,
      clientName: row.clientName,
      ms: row.ms,
    }))
    .sort(
      (a, b) =>
        b.ms - a.ms ||
        a.projectName.localeCompare(b.projectName, "en", { sensitivity: "base" }) ||
        a.projectId.localeCompare(b.projectId),
    );

  return {
    timeZone: input.timeZone,
    generatedAt: input.now.toISOString(),
    weekLabel: weekRangeLabel(weekStart),
    sparklineDates,
    weekDates: currentWeekDates,
    summary: {
      workedTodayMs,
      workedTodayDeltaMs: workedTodayMs - sumIn(entries, yesterdayWindow, nowMs),
      workedTodaySparkline: dailyMs,
      projectsWorked,
      projectsDelta: projectsWorked - projectsIn(entries, lastWeek, nowMs).size,
      projectsSparkline: dailyProjects,
      workedWeekMs,
      workedWeekDeltaMs: workedWeekMs - sumIn(entries, lastWeek, nowMs),
      workedWeekSparkline: dailyMs,
    },
    online,
    projects,
  };
}

const entrySelect = {
  id: true,
  userId: true,
  projectId: true,
  note: true,
  startedAt: true,
  endedAt: true,
  project: { select: { name: true, client: { select: { name: true } } } },
  todo: { select: { title: true } },
  user: { select: { deactivatedAt: true } },
} as const;

type EntryRow = {
  id: string;
  userId: string | null;
  projectId: string;
  note: string | null;
  startedAt: Date;
  endedAt: Date | null;
  project: { name: string; client: { name: string } | null };
  todo: { title: string } | null;
  user: { deactivatedAt: Date | null } | null;
};

function toEntry(row: EntryRow, nowMs: number): DashboardEntry | null {
  if (!row.userId || row.user?.deactivatedAt) return null;
  const startedAtMs = row.startedAt.getTime();
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    projectName: row.project.name,
    clientName: row.project.client?.name ?? null,
    todoTitle: row.todo?.title ?? null,
    note: row.note,
    startedAtMs,
    endedAtMs: row.endedAt?.getTime() ?? nowMs,
    running: row.endedAt === null && startedAtMs <= nowMs,
  };
}

async function latestEntryIds(userIds: string[], now: Date) {
  if (userIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT ON ("userId") "id"
    FROM "TimeEntry"
    WHERE "userId" IN (${Prisma.join(userIds)})
      AND "startedAt" <= ${now}
    ORDER BY "userId", ("endedAt" IS NULL) DESC, COALESCE("endedAt", "startedAt") DESC, "startedAt" DESC, "id" DESC
  `);
  return rows.map((row) => row.id);
}

/**
 * Team dashboard for an owner or admin. Members are rejected before any time
 * entry is read. Active people are users who have not been deactivated.
 */
export async function loadDashboard(input: {
  role: string;
  now?: Date;
}): Promise<{ ok: true; dashboard: DashboardPayload } | { ok: false; error: "forbidden" }> {
  if (!canManageWorkspace(input.role)) return { ok: false, error: "forbidden" };
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const timeZone = await getWorkspaceTimeZone();
  const today = todayInTimeZone(timeZone, now);
  const rangeStart = zonedDayStart(addCalendarDays(startOfWeekDate(today), -7), timeZone);
  const rangeEnd = zonedDayEnd(today, timeZone);

  const people = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const windowRows = await prisma.timeEntry.findMany({
    where: {
      userId: { not: null },
      user: { deactivatedAt: null },
      startedAt: { lt: rangeEnd },
      OR: [{ endedAt: null }, { endedAt: { gt: rangeStart } }],
    },
    select: entrySelect,
  });

  const have = new Set(windowRows.map((row) => row.id));
  const missing = (await latestEntryIds(people.map((person) => person.id), now)).filter((id) => !have.has(id));
  const extra =
    missing.length === 0
      ? []
      : await prisma.timeEntry.findMany({
          where: { id: { in: missing } },
          select: entrySelect,
        });

  const entries: DashboardEntry[] = [];
  for (const row of [...windowRows, ...extra]) {
    const entry = toEntry(row, nowMs);
    if (entry) entries.push(entry);
  }

  return {
    ok: true,
    dashboard: buildDashboard({
      timeZone,
      now,
      members: people,
      entries,
    }),
  };
}
