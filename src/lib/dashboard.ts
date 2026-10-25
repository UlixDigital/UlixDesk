import type { BudgetRecord } from "@/lib/budgets";
import { evaluateBudget, projectBudgetVisibleToViewer } from "@/lib/budgets";
import { isBudgetBasis, isBudgetRecurrence, type BudgetEntrySlice } from "@/lib/budget-period";
import { getWorkspaceTimeZone, listAllBillRates } from "@/lib/bill-rates";
import { prisma } from "@/lib/db";
import {
  badgeColor,
  budgetTypeLabel,
  formatClock,
  nameInitial,
  weekRangeLabel,
  type BudgetRow,
  type DashboardPayload,
  type DashboardScope,
  type OnlinePerson,
  type ProjectRow,
  type TeamRow,
  type WorkedPerson,
} from "@/lib/dashboard-format";
import { minorDigits } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { pickRate, utcDateKey, type BillRateRecord } from "@/lib/rates";
import {
  addCalendarDays,
  formatZonedTime,
  startOfWeekDate,
  todayInTimeZone,
  weekdayShort,
  weekDates,
  zonedDayEnd,
  zonedDayStart,
} from "@/lib/time-zone";
import { canManageWorkspace, canSeeMoney } from "@/lib/users-validation";

export type DashboardEntry = {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  clientId: string | null;
  todoId: string | null;
  todoTitle: string | null;
  startedAtMs: number;
  endedAtMs: number;
  running: boolean;
  billable: boolean;
  projectBillable: boolean;
};

export type DashboardPerson = { id: string; name: string };

export type DashboardBudgetEntry = {
  userId: string;
  projectId: string;
  clientId: string | null;
  startedAtMs: number;
  endedAtMs: number;
  billable: boolean;
  projectBillable: boolean;
};

export type DashboardBudgetSource = {
  record: BudgetRecord;
  name: string;
  trackedByActor: boolean;
};

export function rangeOverlap(start: number, end: number, rangeStart: number, rangeEnd: number) {
  const from = Math.max(start, rangeStart);
  const to = Math.min(end, rangeEnd);
  return to > from ? to - from : 0;
}

function closedStop(entry: { endedAtMs: number; running: boolean }, nowMs: number) {
  return Math.min(entry.running ? nowMs : entry.endedAtMs, nowMs);
}

function sumOverlap(entries: DashboardEntry[], rangeStart: number, rangeEnd: number, nowMs: number) {
  let total = 0;
  for (const entry of entries) {
    total += rangeOverlap(entry.startedAtMs, closedStop(entry, nowMs), rangeStart, rangeEnd);
  }
  return total;
}

function dayBound(date: string, timeZone: string) {
  return {
    start: zonedDayStart(date, timeZone).getTime(),
    end: zonedDayEnd(date, timeZone).getTime(),
  };
}

function sharePercent(part: number, total: number) {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part * 100) / total);
}

/** USD uses `$1,250.50`. Other currencies keep the workspace money format. */
export function formatDashboardMoney(amountMinor: number, currency: string) {
  const digits = minorDigits(currency) ?? 2;
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const scale = 10 ** digits;
  const whole = digits === 0 ? abs : Math.trunc(abs / scale);
  const fraction = digits === 0 ? 0 : abs % scale;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = digits === 0 ? grouped : `${grouped}.${String(fraction).padStart(digits, "0")}`;
  if (currency === "USD") return `${negative ? "-" : ""}$${body}`;
  return formatMoney(amountMinor, currency);
}

function personBits(id: string, name: string) {
  return { initial: nameInitial(name), color: badgeColor(id) };
}

export function buildDashboard(input: {
  actorId: string;
  scope: DashboardScope;
  canChooseScope: boolean;
  showMoney: boolean;
  timeZone: string;
  now: Date;
  people: DashboardPerson[];
  entries: DashboardEntry[];
  budgetEntries: DashboardBudgetEntry[];
  budgets: DashboardBudgetSource[];
  rates: BillRateRecord[];
}): DashboardPayload {
  const nowMs = input.now.getTime();
  const people =
    input.scope === "me" ? input.people.filter((person) => person.id === input.actorId) : input.people;
  const allowed = new Set(people.map((person) => person.id));
  const entries = input.entries.filter((entry) => allowed.has(entry.userId));
  const names = new Map(people.map((person) => [person.id, person.name]));

  const today = todayInTimeZone(input.timeZone, input.now);
  const yesterday = addCalendarDays(today, -1);
  const weekStart = startOfWeekDate(today);
  const thisWeek = weekDates(today);
  const lastWeekStart = addCalendarDays(weekStart, -7);
  const lastWeek = weekDates(lastWeekStart);
  const rolling = Array.from({ length: 7 }, (_, index) => addCalendarDays(today, index - 6));

  const bounds = new Map<string, { start: number; end: number }>();
  for (const date of [...lastWeek, ...thisWeek, ...rolling, yesterday, today]) {
    if (!bounds.has(date)) bounds.set(date, dayBound(date, input.timeZone));
  }
  const bound = (date: string) => bounds.get(date) ?? dayBound(date, input.timeZone);

  const dailyMs = (dates: string[]) =>
    dates.map((date) => {
      const window = bound(date);
      return sumOverlap(entries, window.start, window.end, nowMs);
    });

  const todayWindow = bound(today);
  const yesterdayWindow = bound(yesterday);
  const weekWindow = {
    start: bound(thisWeek[0] ?? weekStart).start,
    end: bound(thisWeek[6] ?? weekStart).end,
  };
  const lastWeekWindow = {
    start: bound(lastWeek[0] ?? lastWeekStart).start,
    end: bound(lastWeek[6] ?? lastWeekStart).end,
  };

  const workedTodayMs = sumOverlap(entries, todayWindow.start, todayWindow.end, nowMs);
  const workedYesterdayMs = sumOverlap(entries, yesterdayWindow.start, yesterdayWindow.end, nowMs);
  const workedWeekMs = sumOverlap(entries, weekWindow.start, weekWindow.end, nowMs);
  const workedLastWeekMs = sumOverlap(entries, lastWeekWindow.start, lastWeekWindow.end, nowMs);

  const projectsOn = (window: { start: number; end: number }) => {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (rangeOverlap(entry.startedAtMs, closedStop(entry, nowMs), window.start, window.end) > 0) {
        ids.add(entry.projectId);
      }
    }
    return ids;
  };
  const peopleOn = (window: { start: number; end: number }) => {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (rangeOverlap(entry.startedAtMs, closedStop(entry, nowMs), window.start, window.end) > 0) {
        ids.add(entry.userId);
      }
    }
    return ids.size;
  };

  const onlineEntries = new Map<string, DashboardEntry>();
  for (const entry of entries) {
    if (!entry.running || entry.startedAtMs > nowMs) continue;
    const current = onlineEntries.get(entry.userId);
    if (!current || entry.startedAtMs > current.startedAtMs) onlineEntries.set(entry.userId, entry);
  }

  const online: OnlinePerson[] = [...onlineEntries.values()]
    .map((entry) => {
      const name = names.get(entry.userId) ?? "Member";
      const bits = personBits(entry.userId, name);
      const projectBits = personBits(entry.projectId, entry.projectName);
      return {
        userId: entry.userId,
        name,
        initial: bits.initial,
        color: bits.color,
        projectName: entry.projectName,
        projectInitial: projectBits.initial,
        projectColor: projectBits.color,
        todoTitle: entry.todoTitle,
        startedAt: new Date(entry.startedAtMs).toISOString(),
        startedLabel: formatZonedTime(new Date(entry.startedAtMs), input.timeZone),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.userId.localeCompare(b.userId));

  const byUser = new Map<string, DashboardEntry[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) list.push(entry);
    else byUser.set(entry.userId, [entry]);
  }

  const workedToday: WorkedPerson[] = people
    .map((person) => {
      const own = byUser.get(person.id) ?? [];
      const ms = sumOverlap(own, todayWindow.start, todayWindow.end, nowMs);
      const running = onlineEntries.get(person.id) ?? null;
      let latest: DashboardEntry | null = running;
      let latestEnd = running ? nowMs : -1;
      for (const entry of own) {
        const stop = closedStop(entry, nowMs);
        if (rangeOverlap(entry.startedAtMs, stop, todayWindow.start, todayWindow.end) <= 0) continue;
        const mark = entry.running ? nowMs : entry.endedAtMs;
        if (mark >= latestEnd) {
          latest = entry;
          latestEnd = mark;
        }
      }
      const bits = personBits(person.id, person.name);
      const projectBits = latest ? personBits(latest.projectId, latest.projectName) : null;
      return {
        userId: person.id,
        name: person.name,
        initial: bits.initial,
        color: bits.color,
        ms,
        projectName: latest?.projectName ?? null,
        projectInitial: projectBits?.initial ?? null,
        projectColor: projectBits?.color ?? null,
        todoTitle: latest?.todoTitle ?? null,
        online: Boolean(running),
      };
    })
    .filter((person) => person.online || person.ms > 0)
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const projectMap = new Map<
    string,
    { name: string; ms: number; todos: Map<string, { title: string; ms: number }> }
  >();
  for (const entry of entries) {
    const ms = rangeOverlap(entry.startedAtMs, closedStop(entry, nowMs), weekWindow.start, weekWindow.end);
    if (ms <= 0) continue;
    const row = projectMap.get(entry.projectId) ?? {
      name: entry.projectName,
      ms: 0,
      todos: new Map<string, { title: string; ms: number }>(),
    };
    row.ms += ms;
    if (entry.todoId && entry.todoTitle) {
      const todo = row.todos.get(entry.todoId) ?? { title: entry.todoTitle, ms: 0 };
      todo.ms += ms;
      row.todos.set(entry.todoId, todo);
    }
    projectMap.set(entry.projectId, row);
  }

  const projects: ProjectRow[] = [...projectMap.entries()]
    .map(([id, row]) => {
      const todos = [...row.todos.entries()]
        .map(([todoId, todo]) => ({ id: todoId, title: todo.title, ms: todo.ms }))
        .sort((a, b) => b.ms - a.ms || a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
      const bits = personBits(id, row.name);
      return {
        id,
        name: row.name,
        initial: bits.initial,
        color: bits.color,
        ms: row.ms,
        sharePercent: sharePercent(row.ms, workedWeekMs),
        topTodo: todos[0]?.title ?? null,
        todos,
      };
    })
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const team: TeamRow[] = people
    .map((person) => {
      const own = byUser.get(person.id) ?? [];
      const bits = personBits(person.id, person.name);
      return {
        userId: person.id,
        name: person.name,
        initial: bits.initial,
        color: bits.color,
        todayMs: sumOverlap(own, todayWindow.start, todayWindow.end, nowMs),
        weekMs: sumOverlap(own, weekWindow.start, weekWindow.end, nowMs),
        running: onlineEntries.has(person.id),
      };
    })
    .sort(
      (a, b) =>
        b.todayMs - a.todayMs ||
        b.weekMs - a.weekMs ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );

  const budgets = budgetRows({
    actorId: input.actorId,
    scope: input.scope,
    showMoney: input.showMoney,
    timeZone: input.timeZone,
    now: input.now,
    budgetEntries: input.budgetEntries,
    budgets: input.budgets,
    rates: input.showMoney ? input.rates : [],
  });

  const weekDaily = dailyMs(thisWeek);
  return {
    scope: input.scope,
    canChooseScope: input.canChooseScope,
    showMoney: input.showMoney,
    timeZone: input.timeZone,
    serverNow: nowMs,
    runningTimers: online.length,
    weekLabel: weekRangeLabel(weekStart),
    kpis: {
      workedTodayMs,
      workedTodayDeltaMs: workedTodayMs - workedYesterdayMs,
      workedWeekMs,
      workedWeekDeltaMs: workedWeekMs - workedLastWeekMs,
      todaySparkline: dailyMs(rolling),
      weekSparkline: weekDaily,
      online: online.length,
      teamSize: people.length,
      onlineDelta: peopleOn(todayWindow) - peopleOn(yesterdayWindow),
      onlineSparkline: rolling.map((date) => peopleOn(bound(date))),
      projectsWorked: projectsOn(weekWindow).size,
      projectsDelta: projectsOn(weekWindow).size - projectsOn(lastWeekWindow).size,
      projectsSparkline: thisWeek.map((date) => projectsOn(bound(date)).size),
    },
    online,
    workedToday,
    days: thisWeek.map((date, index) => ({
      date,
      label: weekdayShort(date),
      ms: weekDaily[index] ?? 0,
    })),
    projects,
    team,
    budgets,
  };
}

function budgetRows(input: {
  actorId: string;
  scope: DashboardScope;
  showMoney: boolean;
  timeZone: string;
  now: Date;
  budgetEntries: DashboardBudgetEntry[];
  budgets: DashboardBudgetSource[];
  rates: BillRateRecord[];
}): BudgetRow[] {
  const visible = input.budgets.filter((budget) => {
    if (!input.showMoney) {
      return projectBudgetVisibleToViewer({
        role: "member",
        scope: budget.record.scope,
        basis: budget.record.basis,
        trackedByViewer: budget.trackedByActor,
      });
    }
    if (input.scope === "me" && !budget.trackedByActor) return false;
    return true;
  });

  const source =
    input.scope === "me"
      ? input.budgetEntries.filter((entry) => entry.userId === input.actorId)
      : input.budgetEntries;

  const slicesByProject = new Map<string, BudgetEntrySlice[]>();
  const projectsByClient = new Map<string, Set<string>>();
  for (const entry of source) {
    const rate = input.showMoney
      ? pickRate(
          input.rates,
          {
            projectId: entry.projectId,
            clientId: entry.clientId,
            userId: entry.userId,
            startedAt: new Date(entry.startedAtMs),
          },
          input.timeZone,
        )
      : null;
    const slice: BudgetEntrySlice = {
      startedAtMs: entry.startedAtMs,
      endedAtMs: entry.endedAtMs,
      billable: entry.billable && entry.projectBillable,
      rateMinor: input.showMoney ? (rate?.amountMinor ?? null) : null,
      rateCurrency: input.showMoney ? (rate?.currency ?? null) : null,
    };
    const list = slicesByProject.get(entry.projectId);
    if (list) list.push(slice);
    else slicesByProject.set(entry.projectId, [slice]);
    if (entry.clientId) {
      const projects = projectsByClient.get(entry.clientId) ?? new Set<string>();
      projects.add(entry.projectId);
      projectsByClient.set(entry.clientId, projects);
    }
  }

  return visible
    .map((budget) => {
      const slices =
        budget.record.scope === "project"
          ? (slicesByProject.get(budget.record.projectId ?? "") ?? [])
          : [...(projectsByClient.get(budget.record.clientId ?? "") ?? [])].flatMap(
              (projectId) => slicesByProject.get(projectId) ?? [],
            );
      const evaluated = evaluateBudget(budget.record, slices, input.timeZone, input.now);
      const bits = personBits(budget.record.id, budget.name);
      const hours = budget.record.basis === "hours";
      const spentLabel = hours
        ? formatClock(evaluated.use.includedMs)
        : formatDashboardMoney(evaluated.use.costMinor, budget.record.currency ?? "USD");
      const budgetLabel = hours
        ? formatClock(budget.record.amount * 1000)
        : formatDashboardMoney(budget.record.amount, budget.record.currency ?? "USD");
      const progress =
        evaluated.figures.percentTenths === null
          ? null
          : Math.max(0, Math.min(100, Math.round(evaluated.figures.percentTenths / 10)));
      return {
        id: budget.record.id,
        name: budget.name,
        initial: bits.initial,
        color: bits.color,
        typeLabel: budgetTypeLabel(budget.record.recurrence),
        basis: hours ? ("hours" as const) : ("cost" as const),
        spentLabel,
        budgetLabel,
        progressPercent: progress,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

function toBudgetRecord(row: {
  id: string;
  scope: string;
  projectId: string | null;
  clientId: string | null;
  basis: string;
  amount: number;
  currency: string | null;
  recurrence: string;
  startsOn: Date | null;
  billableOnly: boolean;
  alertPercent: number | null;
  hardStop: boolean;
}): BudgetRecord | null {
  if (row.scope !== "project" && row.scope !== "client") return null;
  if (!isBudgetBasis(row.basis) || !isBudgetRecurrence(row.recurrence)) return null;
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.projectId,
    clientId: row.clientId,
    basis: row.basis,
    amount: row.amount,
    currency: row.currency,
    recurrence: row.recurrence,
    startsOn: row.startsOn ? utcDateKey(row.startsOn) : null,
    billableOnly: row.billableOnly,
    alertPercent: row.alertPercent,
    hardStop: row.hardStop,
  };
}

export async function loadDashboard(input: {
  actor: { id: string; role: string };
  scope: DashboardScope;
  now?: Date;
}): Promise<{ ok: true; dashboard: DashboardPayload } | { ok: false; error: "forbidden" }> {
  if (input.scope === "all" && !canManageWorkspace(input.actor.role)) {
    return { ok: false, error: "forbidden" };
  }
  const showMoney = canSeeMoney(input.actor.role);
  const scope = input.scope;
  const now = input.now ?? new Date();
  const timeZone = await getWorkspaceTimeZone();
  const today = todayInTimeZone(timeZone, now);
  const weekStart = startOfWeekDate(today);
  const rangeStart = zonedDayStart(addCalendarDays(weekStart, -7), timeZone);
  const rangeEnd = zonedDayEnd(weekDates(today)[6] ?? today, timeZone);

  const people = await prisma.user.findMany({
    where: scope === "me" ? { id: input.actor.id } : { deactivatedAt: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const entryRows = await prisma.timeEntry.findMany({
    where: {
      ...(scope === "me" ? { userId: input.actor.id } : { user: { deactivatedAt: null } }),
      startedAt: { lt: rangeEnd },
      OR: [{ endedAt: null }, { endedAt: { gt: rangeStart } }],
    },
    select: {
      id: true,
      userId: true,
      projectId: true,
      todoId: true,
      startedAt: true,
      endedAt: true,
      billable: true,
      user: { select: { name: true, deactivatedAt: true } },
      project: { select: { name: true, billable: true, clientId: true } },
      todo: { select: { title: true } },
    },
  });

  const entries: DashboardEntry[] = [];
  for (const row of entryRows) {
    if (!row.userId || !row.user || row.user.deactivatedAt) continue;
    entries.push({
      id: row.id,
      userId: row.userId,
      projectId: row.projectId,
      projectName: row.project.name,
      clientId: row.project.clientId,
      todoId: row.todoId,
      todoTitle: row.todo?.title ?? null,
      startedAtMs: row.startedAt.getTime(),
      endedAtMs: row.endedAt?.getTime() ?? now.getTime(),
      running: row.endedAt === null,
      billable: row.billable,
      projectBillable: row.project.billable,
    });
  }

  const trackedRows = await prisma.timeEntry.findMany({
    where: { userId: input.actor.id },
    distinct: ["projectId"],
    select: { projectId: true },
  });
  const trackedProjects = new Set(trackedRows.map((row) => row.projectId));
  const trackedProjectRows =
    trackedProjects.size === 0
      ? []
      : await prisma.project.findMany({
          where: { id: { in: [...trackedProjects] } },
          select: { id: true, clientId: true },
        });
  const trackedClients = new Set(
    trackedProjectRows.map((row) => row.clientId).filter((id): id is string => Boolean(id)),
  );

  const budgetRowsRaw = await prisma.budget.findMany({
    include: {
      project: { select: { id: true, name: true, archivedAt: true, clientId: true } },
      client: { select: { id: true, name: true, archivedAt: true } },
    },
  });
  const budgets: DashboardBudgetSource[] = [];
  for (const row of budgetRowsRaw) {
    const record = toBudgetRecord(row);
    if (!record) continue;
    const archived = record.scope === "project" ? row.project?.archivedAt != null : row.client?.archivedAt != null;
    if (archived) continue;
    const name = record.scope === "project" ? row.project?.name : row.client?.name;
    if (!name) continue;
    const trackedByActor =
      record.scope === "project"
        ? Boolean(record.projectId && trackedProjects.has(record.projectId))
        : Boolean(record.clientId && trackedClients.has(record.clientId));
    if (!showMoney && (record.basis !== "hours" || record.scope !== "project")) continue;
    budgets.push({ record, name, trackedByActor });
  }

  const projectIds = [
    ...new Set(budgets.flatMap((budget) => (budget.record.projectId ? [budget.record.projectId] : []))),
  ];
  const clientIds = [
    ...new Set(budgets.flatMap((budget) => (budget.record.clientId ? [budget.record.clientId] : []))),
  ];
  const orFilters = [
    ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
    ...(clientIds.length > 0 ? [{ project: { clientId: { in: clientIds } } }] : []),
  ];
  const budgetEntryRows =
    orFilters.length === 0
      ? []
      : await prisma.timeEntry.findMany({
          where: {
            endedAt: { not: null },
            ...(scope === "me" ? { userId: input.actor.id } : { user: { deactivatedAt: null } }),
            OR: orFilters,
          },
          select: {
            userId: true,
            projectId: true,
            startedAt: true,
            endedAt: true,
            billable: true,
            project: { select: { billable: true, clientId: true } },
          },
        });
  const budgetEntries: DashboardBudgetEntry[] = [];
  for (const row of budgetEntryRows) {
    if (!row.userId || !row.endedAt) continue;
    budgetEntries.push({
      userId: row.userId,
      projectId: row.projectId,
      clientId: row.project.clientId,
      startedAtMs: row.startedAt.getTime(),
      endedAtMs: row.endedAt.getTime(),
      billable: row.billable,
      projectBillable: row.project.billable,
    });
  }

  const rates = showMoney ? await listAllBillRates() : [];
  return {
    ok: true,
    dashboard: buildDashboard({
      actorId: input.actor.id,
      scope,
      canChooseScope: canManageWorkspace(input.actor.role),
      showMoney,
      timeZone,
      now,
      people,
      entries,
      budgetEntries,
      budgets,
      rates,
    }),
  };
}
