import { describe, expect, it } from "vitest";
import type { BudgetRecord } from "@/lib/budgets";
import {
  buildDashboard,
  formatDashboardMoney,
  type DashboardBudgetSource,
  type DashboardEntry,
  type DashboardPerson,
} from "@/lib/dashboard";
import {
  formatClock,
  formatHm,
  resolveDashboardScope,
  weekRangeLabel,
} from "@/lib/dashboard-format";
import type { BillRateRecord } from "@/lib/rates";
import { zonedDateTimeToUtc } from "@/lib/time-zone";

const zone = "Asia/Colombo";
const now = zonedDateTimeToUtc("2026-10-23", "15:00", zone)!;
const hour = 3_600_000;

const people: DashboardPerson[] = [
  { id: "avery", name: "Avery Lane" },
  { id: "maya", name: "Maya Chen" },
  { id: "jonah", name: "Jonah Ellis" },
];

function at(date: string, time: string) {
  return zonedDateTimeToUtc(date, time, zone)!.getTime();
}

function entry(overrides: Partial<DashboardEntry> & Pick<DashboardEntry, "id" | "userId" | "projectId">): DashboardEntry {
  return {
    projectName: "Website Coding",
    clientId: "client",
    todoId: null,
    todoTitle: null,
    startedAtMs: at("2026-10-23", "09:00"),
    endedAtMs: at("2026-10-23", "10:00"),
    running: false,
    billable: true,
    projectBillable: true,
    ...overrides,
  };
}

function budget(
  overrides: Partial<BudgetRecord> & Pick<BudgetRecord, "id" | "basis">,
  trackedByActor = true,
): DashboardBudgetSource {
  return {
    name: overrides.basis === "hours" ? "Design Mockups" : "Website Coding",
    trackedByActor,
    record: {
      scope: "project",
      projectId: overrides.basis === "hours" ? "design" : "website",
      clientId: null,
      amount: overrides.basis === "hours" ? 8 * 3600 : 100_000,
      currency: overrides.basis === "hours" ? null : "USD",
      recurrence: "total",
      startsOn: null,
      billableOnly: true,
      alertPercent: null,
      hardStop: false,
      ...overrides,
    },
  };
}

const rate: BillRateRecord = {
  id: "rate",
  scope: "project",
  projectId: "website",
  clientId: null,
  userId: null,
  amountMinor: 10_000,
  currency: "USD",
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function teamEntries(): DashboardEntry[] {
  return [
    entry({
      id: "avery-thu",
      userId: "avery",
      projectId: "consult",
      projectName: "Client Consultation",
      startedAtMs: at("2026-10-22", "09:00"),
      endedAtMs: at("2026-10-22", "12:00"),
    }),
    entry({
      id: "maya-mon",
      userId: "maya",
      projectId: "website",
      projectName: "Website Coding",
      todoId: "todo-hero",
      todoTitle: "Homepage hero",
      startedAtMs: at("2026-10-19", "09:00"),
      endedAtMs: at("2026-10-19", "12:00"),
    }),
    entry({
      id: "maya-now",
      userId: "maya",
      projectId: "website",
      projectName: "Website Coding",
      todoId: "todo-hero",
      todoTitle: "Homepage hero",
      startedAtMs: at("2026-10-23", "13:00"),
      endedAtMs: now.getTime(),
      running: true,
    }),
    entry({
      id: "jonah-tue",
      userId: "jonah",
      projectId: "design",
      projectName: "Design Mockups",
      startedAtMs: at("2026-10-20", "10:00"),
      endedAtMs: at("2026-10-20", "14:00"),
    }),
    entry({
      id: "jonah-fri",
      userId: "jonah",
      projectId: "design",
      projectName: "Design Mockups",
      startedAtMs: at("2026-10-23", "08:00"),
      endedAtMs: at("2026-10-23", "10:00"),
    }),
    entry({
      id: "maya-last",
      userId: "maya",
      projectId: "notes",
      projectName: "Notes",
      startedAtMs: at("2026-10-12", "09:00"),
      endedAtMs: at("2026-10-12", "10:00"),
    }),
  ];
}

const MONEY = /\$|\bUSD\b|\bEUR\b|\bGBP\b|\bJPY\b|amountMinor|rateMinor/;

describe("dashboard scope", () => {
  it("defaults owners and admins to all and members to me", () => {
    expect(resolveDashboardScope("owner", null)).toEqual({ ok: true, scope: "all" });
    expect(resolveDashboardScope("admin", "")).toEqual({ ok: true, scope: "all" });
    expect(resolveDashboardScope("admin", "me")).toEqual({ ok: true, scope: "me" });
    expect(resolveDashboardScope("member", null)).toEqual({ ok: true, scope: "me" });
    expect(resolveDashboardScope("member", "me")).toEqual({ ok: true, scope: "me" });
    expect(resolveDashboardScope("member", "all").ok).toBe(false);
    expect(resolveDashboardScope("member", " ALL ").ok).toBe(false);
  });
});

describe("dashboard formatting", () => {
  it("formats clocks, week labels, and USD amounts", () => {
    expect(formatClock(90 * 60 * 1000)).toBe("1:30:00");
    expect(formatClock(44 * hour + 21 * 60 * 1000)).toBe("44:21:00");
    expect(formatHm(8 * hour + 4 * 60 * 1000)).toBe("8:04");
    expect(weekRangeLabel("2026-10-19")).toBe("Mon, Oct 19, 2026 - Sun, Oct 25, 2026");
    expect(formatDashboardMoney(48_000, "USD")).toBe("$480.00");
    expect(formatDashboardMoney(100_000, "USD")).toBe("$1,000.00");
    expect(formatDashboardMoney(1500, "JPY")).toBe("JPY 1,500");
  });
});

describe("buildDashboard", () => {
  const model = buildDashboard({
    actorId: "avery",
    scope: "all",
    canChooseScope: true,
    showMoney: true,
    timeZone: zone,
    now,
    people,
    entries: teamEntries(),
    budgetEntries: teamEntries()
      .filter((item) => !item.running)
      .map((item) => ({
        userId: item.userId,
        projectId: item.projectId,
        clientId: item.clientId,
        startedAtMs: item.startedAtMs,
        endedAtMs: item.endedAtMs,
        billable: item.billable,
        projectBillable: item.projectBillable,
      })),
    budgets: [budget({ id: "cost", basis: "cost", projectId: "website" })],
    rates: [rate],
  });

  it("summarizes the week for the whole team", () => {
    expect(model.weekLabel).toBe("Mon, Oct 19, 2026 - Sun, Oct 25, 2026");
    expect(model.kpis.workedTodayMs).toBe(4 * hour);
    expect(model.kpis.workedTodayDeltaMs).toBe(1 * hour);
    expect(model.kpis.workedWeekMs).toBe(14 * hour);
    expect(model.kpis.workedWeekDeltaMs).toBe(13 * hour);
    expect(model.kpis.online).toBe(1);
    expect(model.kpis.teamSize).toBe(3);
    expect(model.kpis.projectsWorked).toBe(3);
    expect(model.kpis.projectsDelta).toBe(2);
    expect(model.kpis.todaySparkline).toHaveLength(7);
    expect(model.kpis.weekSparkline).toHaveLength(7);
    expect(model.kpis.onlineSparkline).toHaveLength(7);
    expect(model.kpis.projectsSparkline).toHaveLength(7);
    expect(model.days.map((day) => day.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(model.days.find((day) => day.date === "2026-10-23")?.ms).toBe(4 * hour);
    expect(model.online).toMatchObject([
      {
        name: "Maya Chen",
        projectName: "Website Coding",
        todoTitle: "Homepage hero",
        startedLabel: "1:00 PM",
      },
    ]);
    expect(model.projects.map((project) => [project.name, project.sharePercent, formatClock(project.ms)])).toEqual([
      ["Design Mockups", 43, "6:00:00"],
      ["Website Coding", 36, "5:00:00"],
      ["Client Consultation", 21, "3:00:00"],
    ]);
    expect(model.projects.find((project) => project.name === "Website Coding")?.topTodo).toBe("Homepage hero");
    expect(model.team.map((person) => person.name)).toEqual(["Jonah Ellis", "Maya Chen", "Avery Lane"]);
    expect(model.budgets).toMatchObject([
      { name: "Website Coding", basis: "cost", typeLabel: "Fixed", spentLabel: "$300.00", budgetLabel: "$1,000.00" },
    ]);
  });

  it("splits an entry that crosses midnight in the workspace zone", () => {
    const split = buildDashboard({
      actorId: "maya",
      scope: "me",
      canChooseScope: false,
      showMoney: false,
      timeZone: zone,
      now,
      people,
      entries: [
        entry({
          id: "overnight",
          userId: "maya",
          projectId: "website",
          startedAtMs: at("2026-10-22", "23:30"),
          endedAtMs: at("2026-10-23", "01:30"),
        }),
      ],
      budgetEntries: [],
      budgets: [],
      rates: [],
    });
    expect(split.days.find((day) => day.date === "2026-10-22")?.ms).toBe(30 * 60 * 1000);
    expect(split.days.find((day) => day.date === "2026-10-23")?.ms).toBe(90 * 60 * 1000);
  });

  it("keeps me scope on the signed-in person and hides money from members", () => {
    const mine = buildDashboard({
      actorId: "maya",
      scope: "me",
      canChooseScope: false,
      showMoney: false,
      timeZone: zone,
      now,
      people,
      entries: teamEntries(),
      budgetEntries: teamEntries()
        .filter((item) => !item.running)
        .map((item) => ({
          userId: item.userId,
          projectId: item.projectId,
          clientId: item.clientId,
          startedAtMs: item.startedAtMs,
          endedAtMs: item.endedAtMs,
          billable: true,
          projectBillable: true,
        })),
      budgets: [
        budget({ id: "cost", basis: "cost", projectId: "website" }),
        budget({ id: "hours", basis: "hours", projectId: "design", amount: 8 * 3600 }, false),
      ],
      rates: [rate],
    });
    expect(mine.team.map((person) => person.name)).toEqual(["Maya Chen"]);
    expect(mine.kpis.teamSize).toBe(1);
    expect(mine.kpis.online).toBe(1);
    expect(JSON.stringify(mine)).not.toMatch(MONEY);
    expect(JSON.stringify(mine)).not.toContain("Jonah Ellis");
    expect(JSON.stringify(mine)).not.toContain("Avery Lane");
    expect(mine.budgets.every((row) => row.basis === "hours")).toBe(true);
    expect(mine.budgets).toHaveLength(0);
  });

  it("counts a running timer in today and leaves it out of budget spend", () => {
    const mixed = buildDashboard({
      actorId: "maya",
      scope: "me",
      canChooseScope: true,
      showMoney: true,
      timeZone: zone,
      now,
      people,
      entries: [
        entry({
          id: "closed",
          userId: "maya",
          projectId: "website",
          startedAtMs: at("2026-10-23", "08:00"),
          endedAtMs: at("2026-10-23", "09:00"),
        }),
        entry({
          id: "open",
          userId: "maya",
          projectId: "website",
          startedAtMs: at("2026-10-23", "14:00"),
          endedAtMs: now.getTime(),
          running: true,
        }),
      ],
      budgetEntries: [
        {
          userId: "maya",
          projectId: "website",
          clientId: "client",
          startedAtMs: at("2026-10-23", "08:00"),
          endedAtMs: at("2026-10-23", "09:00"),
          billable: true,
          projectBillable: true,
        },
      ],
      budgets: [budget({ id: "cost", basis: "cost", projectId: "website", amount: 20_000 })],
      rates: [rate],
    });
    expect(mixed.kpis.workedTodayMs).toBe(2 * hour);
    expect(mixed.budgets[0]).toMatchObject({ spentLabel: "$100.00", budgetLabel: "$200.00" });
  });
});
