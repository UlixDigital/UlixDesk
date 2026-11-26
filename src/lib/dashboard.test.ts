import { describe, expect, it } from "vitest";
import { dashboardLandingPath, buildDashboard, type DashboardEntry, type DashboardMember } from "@/lib/dashboard";
import {
  formatClock,
  formatLastUpdated,
  formatPeriodDelta,
  weekRangeLabel,
} from "@/lib/dashboard-format";
import { addCalendarDays, zonedDateTimeToUtc } from "@/lib/time-zone";

const colombo = "Asia/Colombo";
const hour = 3_600_000;
const now = zonedDateTimeToUtc("2026-10-23", "15:00", colombo)!;

const people: DashboardMember[] = [
  { id: "avery", name: "Avery Lane" },
  { id: "maya", name: "Maya Chen" },
  { id: "jonah", name: "Jonah Ellis" },
];

function at(date: string, time: string, zone = colombo) {
  return zonedDateTimeToUtc(date, time, zone)!.getTime();
}

function entry(
  overrides: Partial<DashboardEntry> & Pick<DashboardEntry, "id" | "userId" | "projectId">,
): DashboardEntry {
  return {
    projectName: "Website Coding",
    clientName: "Northwind",
    todoTitle: null,
    note: null,
    startedAtMs: at("2026-10-23", "09:00"),
    endedAtMs: at("2026-10-23", "10:00"),
    running: false,
    ...overrides,
  };
}

function model(entries: DashboardEntry[], members = people, zone = colombo, instant = now) {
  return buildDashboard({ timeZone: zone, now: instant, members, entries });
}

function forbiddenKeys(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (/money|amount|percent|activity|idle|screenshot|productivity|currency|^rate$/i.test(key)) {
      found.push(key);
    }
    forbiddenKeys(child, found);
  }
  return found;
}

describe("dashboard landing", () => {
  it("sends owners and admins to the dashboard and everyone else to clients", () => {
    expect(dashboardLandingPath("owner")).toBe("/dashboard");
    expect(dashboardLandingPath("admin")).toBe("/dashboard");
    expect(dashboardLandingPath("member")).toBe("/clients");
    expect(dashboardLandingPath(null)).toBe("/clients");
    expect(dashboardLandingPath(undefined)).toBe("/clients");
    expect(dashboardLandingPath("")).toBe("/clients");
  });
});

describe("dashboard formatting", () => {
  it("formats clocks and period deltas as H:MM:SS", () => {
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock(90 * 60 * 1000)).toBe("1:30:00");
    expect(formatClock(15 * hour + 21 * 60 * 1000 + 2 * 1000)).toBe("15:21:02");
    expect(formatClock(-1)).toBe("0:00:00");
    expect(formatPeriodDelta(-(15 * hour + 21 * 60 * 1000 + 2 * 1000), "duration", "yesterday")).toBe(
      "down 15:21:02 vs yesterday",
    );
    expect(formatPeriodDelta(hour, "duration", "last week")).toBe("up 1:00:00 vs last week");
    expect(formatPeriodDelta(0, "duration", "yesterday")).toBe("0:00:00 vs yesterday");
    expect(formatPeriodDelta(2, "count", "last week")).toBe("up 2 vs last week");
    expect(formatPeriodDelta(-1, "count", "last week")).toBe("down 1 vs last week");
    expect(formatPeriodDelta(0, "count", "last week")).toBe("0 vs last week");
    expect(weekRangeLabel("2026-10-19")).toBe("Mon, Oct 19, 2026 – Sun, Oct 25, 2026");
  });

  it("describes how long ago the dashboard was refreshed", () => {
    expect(formatLastUpdated(0)).toBe("Last updated just now");
    expect(formatLastUpdated(9_000)).toBe("Last updated just now");
    expect(formatLastUpdated(12_000)).toBe("Last updated 12 seconds ago");
    expect(formatLastUpdated(60_000)).toBe("Last updated 1 minute ago");
    expect(formatLastUpdated(5 * 60_000)).toBe("Last updated 5 minutes ago");
    expect(formatLastUpdated(hour)).toBe("Last updated 1 hour ago");
    expect(formatLastUpdated(3 * 24 * hour)).toBe("Last updated 3 days ago");
  });
});

describe("buildDashboard", () => {
  it("splits an entry on the workspace midnight, not the UTC date", () => {
    const dashboard = model([
      entry({
        id: "split",
        userId: "maya",
        projectId: "website",
        startedAtMs: at("2026-10-22", "23:00"),
        endedAtMs: at("2026-10-23", "01:00"),
      }),
    ]);
    expect(dashboard.summary.workedTodayMs).toBe(hour);
    // Yesterday's matching window ends at 15:00, so the 23:00–midnight slice is outside it.
    expect(dashboard.summary.workedTodayDeltaMs).toBe(hour);
    const thursday = dashboard.sparklineDates.indexOf("2026-10-22");
    const friday = dashboard.sparklineDates.indexOf("2026-10-23");
    expect(dashboard.summary.workedTodaySparkline[thursday]).toBe(hour);
    expect(dashboard.summary.workedTodaySparkline[friday]).toBe(hour);
  });

  it("keeps a Colombo morning on Colombo's date when UTC is still the day before", () => {
    const dashboard = model([
      entry({
        id: "utc-shift",
        userId: "maya",
        projectId: "website",
        startedAtMs: Date.parse("2026-10-18T20:00:00.000Z"),
        endedAtMs: Date.parse("2026-10-18T21:00:00.000Z"),
      }),
    ]);
    expect(dashboard.summary.workedWeekMs).toBe(hour);
    const sunday = dashboard.sparklineDates.indexOf("2026-10-18");
    const monday = dashboard.sparklineDates.indexOf("2026-10-19");
    expect(dashboard.summary.workedTodaySparkline[sunday]).toBe(0);
    expect(dashboard.summary.workedTodaySparkline[monday]).toBe(hour);
    expect(dashboard.summary.projectsWorked).toBe(1);
  });

  it("compares today with yesterday only up to the same local time", () => {
    const dashboard = model([
      entry({
        id: "today",
        userId: "maya",
        projectId: "website",
        startedAtMs: at("2026-10-23", "14:00"),
        endedAtMs: at("2026-10-23", "15:00"),
      }),
      entry({
        id: "yesterday-inside",
        userId: "jonah",
        projectId: "website",
        startedAtMs: at("2026-10-22", "14:00"),
        endedAtMs: at("2026-10-22", "15:00"),
      }),
      entry({
        id: "yesterday-after",
        userId: "jonah",
        projectId: "website",
        startedAtMs: at("2026-10-22", "15:00"),
        endedAtMs: at("2026-10-22", "18:00"),
      }),
    ]);
    expect(dashboard.summary.workedTodayMs).toBe(hour);
    expect(dashboard.summary.workedTodayDeltaMs).toBe(0);
    expect(formatPeriodDelta(dashboard.summary.workedTodayDeltaMs, "duration", "yesterday")).toBe(
      "0:00:00 vs yesterday",
    );
  });

  it("puts a week boundary on Monday at workspace midnight", () => {
    const dashboard = model([
      entry({
        id: "sunday",
        userId: "maya",
        projectId: "notes",
        projectName: "Notes",
        startedAtMs: at("2026-10-18", "23:00"),
        endedAtMs: at("2026-10-19", "00:00"),
      }),
      entry({
        id: "monday",
        userId: "maya",
        projectId: "website",
        startedAtMs: at("2026-10-19", "00:00"),
        endedAtMs: at("2026-10-19", "01:00"),
      }),
    ]);
    expect(dashboard.summary.workedWeekMs).toBe(hour);
    expect(dashboard.summary.projectsWorked).toBe(1);
    expect(dashboard.projects.map((project) => project.projectName)).toEqual(["Website Coding"]);
  });

  it("compares this week with the same span of last week and keeps the sparkline on the last 7 days", () => {
    const dashboard = model([
      entry({
        id: "this-monday",
        userId: "maya",
        projectId: "website",
        startedAtMs: at("2026-10-19", "09:00"),
        endedAtMs: at("2026-10-19", "11:00"),
      }),
      entry({
        id: "last-monday",
        userId: "jonah",
        projectId: "design",
        projectName: "Design Mockups",
        startedAtMs: at("2026-10-12", "09:00"),
        endedAtMs: at("2026-10-12", "10:00"),
      }),
      entry({
        id: "last-saturday",
        userId: "avery",
        projectId: "consult",
        projectName: "Client Consultation",
        clientName: "Brightpath",
        startedAtMs: at("2026-10-17", "10:00"),
        endedAtMs: at("2026-10-17", "11:00"),
      }),
    ]);
    expect(dashboard.weekLabel).toBe("Mon, Oct 19, 2026 – Sun, Oct 25, 2026");
    expect(dashboard.sparklineDates).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(dashboard.weekDates[0]).toBe("2026-10-19");
    expect(dashboard.weekDates).toHaveLength(7);
    expect(dashboard.summary.workedWeekMs).toBe(2 * hour);
    expect(dashboard.summary.workedWeekDeltaMs).toBe(hour);
    expect(dashboard.summary.workedWeekSparkline).toHaveLength(7);
    expect(dashboard.summary.workedTodaySparkline).toEqual(dashboard.summary.workedWeekSparkline);
    expect(dashboard.summary.workedWeekSparkline[0]).toBe(hour);
    expect(dashboard.summary.workedWeekMs).not.toBe(
      dashboard.summary.workedWeekSparkline.reduce((sum, value) => sum + value, 0),
    );
    expect(dashboard.summary.projectsWorked).toBe(1);
    expect(dashboard.summary.projectsDelta).toBe(0);
    expect(dashboard.summary.projectsSparkline[0]).toBe(1);
    expect(dashboard.summary.projectsSparkline[2]).toBe(1);
  });

  it("counts each project once per day and once for the week", () => {
    const dashboard = model([
      entry({
        id: "mon",
        userId: "maya",
        projectId: "website",
        startedAtMs: at("2026-10-19", "09:00"),
        endedAtMs: at("2026-10-19", "10:00"),
      }),
      entry({
        id: "mon-again",
        userId: "jonah",
        projectId: "website",
        startedAtMs: at("2026-10-19", "11:00"),
        endedAtMs: at("2026-10-19", "12:00"),
      }),
      entry({
        id: "tue",
        userId: "maya",
        projectId: "design",
        projectName: "Design Mockups",
        clientName: "Brightpath",
        startedAtMs: at("2026-10-20", "09:00"),
        endedAtMs: at("2026-10-20", "13:00"),
      }),
      entry({
        id: "last",
        userId: "avery",
        projectId: "old",
        projectName: "Old Work",
        startedAtMs: at("2026-10-12", "09:00"),
        endedAtMs: at("2026-10-12", "10:00"),
      }),
    ]);
    expect(dashboard.summary.projectsWorked).toBe(2);
    expect(dashboard.summary.projectsDelta).toBe(1);
    const monday = dashboard.sparklineDates.indexOf("2026-10-19");
    expect(dashboard.summary.projectsSparkline[monday]).toBe(1);
    expect(dashboard.projects.map((project) => [project.projectName, project.clientName, project.ms])).toEqual([
      ["Design Mockups", "Brightpath", 4 * hour],
      ["Website Coding", "Northwind", 2 * hour],
    ]);
  });

  it("treats a running timer as Working and counts only the time up to now", () => {
    const dashboard = model([
      entry({
        id: "earlier",
        userId: "maya",
        projectId: "design",
        projectName: "Design Mockups",
        clientName: "Brightpath",
        note: "Old note",
        startedAtMs: at("2026-10-23", "08:00"),
        endedAtMs: at("2026-10-23", "09:00"),
      }),
      entry({
        id: "running",
        userId: "maya",
        projectId: "website",
        todoTitle: "Homepage hero",
        note: "Should not win",
        startedAtMs: at("2026-10-23", "13:00"),
        endedAtMs: now.getTime(),
        running: true,
      }),
      entry({
        id: "future",
        userId: "jonah",
        projectId: "website",
        startedAtMs: at("2026-10-23", "16:00"),
        endedAtMs: at("2026-10-23", "17:00"),
        running: true,
      }),
    ]);
    const maya = dashboard.online.find((person) => person.userId === "maya");
    const jonah = dashboard.online.find((person) => person.userId === "jonah");
    expect(maya).toMatchObject({
      working: true,
      projectName: "Website Coding",
      clientName: "Northwind",
      detail: "Homepage hero",
      todayMs: 3 * hour,
    });
    expect(jonah).toMatchObject({ working: false, projectName: null, todayMs: 0 });
    expect(dashboard.summary.workedTodayMs).toBe(3 * hour);
    expect(dashboard.online.map((person) => person.userId)).toEqual(["maya", "avery", "jonah"]);
  });

  it("shows the last project, preferring a to-do title over a note", () => {
    const dashboard = model([
      entry({
        id: "older",
        userId: "jonah",
        projectId: "website",
        startedAtMs: at("2026-10-20", "09:00"),
        endedAtMs: at("2026-10-20", "10:00"),
        note: "Earlier note",
      }),
      entry({
        id: "latest",
        userId: "jonah",
        projectId: "design",
        projectName: "Design Mockups",
        clientName: "Brightpath",
        todoTitle: "  Logo lockup  ",
        note: "Pencil sketch",
        startedAtMs: at("2026-10-22", "10:00"),
        endedAtMs: at("2026-10-22", "12:00"),
      }),
      entry({
        id: "note-only",
        userId: "avery",
        projectId: "consult",
        projectName: "Client Consultation",
        clientName: null,
        note: "  Call with Sam  ",
        startedAtMs: at("2026-10-21", "09:00"),
        endedAtMs: at("2026-10-21", "10:00"),
      }),
    ]);
    expect(dashboard.online.find((person) => person.userId === "jonah")).toMatchObject({
      working: false,
      projectName: "Design Mockups",
      clientName: "Brightpath",
      detail: "Logo lockup",
      todayMs: 0,
      weekMs: 3 * hour,
    });
    expect(dashboard.online.find((person) => person.userId === "avery")).toMatchObject({
      working: false,
      projectName: "Client Consultation",
      clientName: null,
      detail: "Call with Sam",
    });
    const jonah = dashboard.online.find((person) => person.userId === "jonah")!;
    expect(jonah.weekBars).toHaveLength(7);
    expect(jonah.weekBars.reduce((sum, value) => sum + value, 0)).toBe(jonah.weekMs);
  });

  it("keeps a person with no time, and ignores time for someone who is not listed", () => {
    const dashboard = model([
      entry({
        id: "hidden",
        userId: "hidden",
        projectId: "secret",
        projectName: "Secret",
        startedAtMs: at("2026-10-23", "09:00"),
        endedAtMs: at("2026-10-23", "12:00"),
      }),
    ]);
    expect(dashboard.online).toHaveLength(3);
    expect(dashboard.online.every((person) => !person.working && person.projectName === null)).toBe(true);
    expect(dashboard.summary.workedTodayMs).toBe(0);
    expect(dashboard.projects).toEqual([]);
    expect(forbiddenKeys(dashboard)).toEqual([]);
  });

  it("uses real instants across a daylight-saving change", () => {
    const zone = "America/New_York";
    const springNow = zonedDateTimeToUtc("2026-03-08", "15:00", zone)!;
    const springStart = zonedDateTimeToUtc("2026-03-08", "01:30", zone)!;
    const springEnd = zonedDateTimeToUtc("2026-03-08", "03:30", zone)!;
    const spring = model(
      [
        entry({
          id: "spring",
          userId: "maya",
          projectId: "website",
          startedAtMs: springStart.getTime(),
          endedAtMs: springEnd.getTime(),
        }),
      ],
      people,
      zone,
      springNow,
    );
    const springMs = springEnd.getTime() - springStart.getTime();
    expect(springMs).toBe(hour);
    expect(spring.summary.workedTodayMs).toBe(springMs);

    const fallNow = zonedDateTimeToUtc("2026-11-01", "15:00", zone)!;
    const fallStart = zonedDateTimeToUtc("2026-11-01", "00:30", zone)!;
    const fallEnd = zonedDateTimeToUtc("2026-11-01", "03:30", zone)!;
    const fall = model(
      [
        entry({
          id: "fall",
          userId: "maya",
          projectId: "website",
          startedAtMs: fallStart.getTime(),
          endedAtMs: fallEnd.getTime(),
        }),
      ],
      people,
      zone,
      fallNow,
    );
    const fallMs = fallEnd.getTime() - fallStart.getTime();
    expect(fallMs).toBe(4 * hour);
    expect(fall.summary.workedTodayMs).toBe(fallMs);
    expect(fall.sparklineDates[6]).toBe("2026-11-01");
    expect(fall.sparklineDates[0]).toBe(addCalendarDays("2026-11-01", -6));
  });
});
