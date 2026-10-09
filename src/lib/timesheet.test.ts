import { describe, expect, it } from "vitest";
import { timeCopy } from "@/lib/time-copy";
import {
  buildDailyTimesheet,
  buildWeeklyTimesheet,
  formatElapsed,
  formatTrackedDuration,
  timesheetEmptyCopy,
  timesheetsHref,
  type TimesheetEntry,
} from "@/lib/timesheet";

function entry(overrides: Partial<TimesheetEntry> & Pick<TimesheetEntry, "id" | "startedAt" | "endedAt">): TimesheetEntry {
  return {
    projectId: "project-1",
    projectName: "Website",
    projectArchived: false,
    clientId: "client-1",
    clientName: "Acme",
    billable: true,
    note: null,
    source: "manual",
    ...overrides,
  };
}

describe("timesheet totals and day boundaries", () => {
  it("puts a late Los Angeles evening on Friday locally and Saturday in UTC", () => {
    const rows = [
      entry({
        id: "late",
        startedAt: new Date("2026-10-10T06:30:00.000Z"),
        endedAt: new Date("2026-10-10T07:00:00.000Z"),
      }),
    ];

    const losAngeles = buildDailyTimesheet({
      date: "2026-10-09",
      timeZone: "America/Los_Angeles",
      entries: rows,
    });
    const nextLocalDay = buildDailyTimesheet({
      date: "2026-10-10",
      timeZone: "America/Los_Angeles",
      entries: rows,
    });
    const utcDay = buildDailyTimesheet({
      date: "2026-10-09",
      timeZone: "UTC",
      entries: rows,
    });
    const utcNext = buildDailyTimesheet({
      date: "2026-10-10",
      timeZone: "UTC",
      entries: rows,
    });

    expect(losAngeles.totalMs).toBe(30 * 60 * 1000);
    expect(losAngeles.rows[0]?.startLabel).toBe("11:30 PM");
    expect(nextLocalDay.totalMs).toBe(0);
    expect(utcDay.totalMs).toBe(0);
    expect(utcNext.totalMs).toBe(30 * 60 * 1000);
  });

  it("splits a cross-midnight entry across the two local days and the weekly columns", () => {
    const rows = [
      entry({
        id: "split",
        startedAt: new Date("2026-10-10T06:30:00.000Z"),
        endedAt: new Date("2026-10-10T07:30:00.000Z"),
        source: "timer",
      }),
      entry({
        id: "morning",
        projectId: "project-2",
        projectName: "API",
        startedAt: new Date("2026-10-09T16:00:00.000Z"),
        endedAt: new Date("2026-10-09T17:00:00.000Z"),
      }),
    ];

    const friday = buildDailyTimesheet({
      date: "2026-10-09",
      timeZone: "America/Los_Angeles",
      entries: rows,
    });
    const saturday = buildDailyTimesheet({
      date: "2026-10-10",
      timeZone: "America/Los_Angeles",
      entries: rows,
    });
    expect(friday.rows.map((row) => row.id)).toEqual(["morning", "split"]);
    expect(friday.rows[1]).toMatchObject({
      durationMs: 30 * 60 * 1000,
      continuesToNext: true,
      continuesFromPrevious: false,
    });
    expect(friday.totalMs).toBe(90 * 60 * 1000);
    expect(saturday.rows[0]).toMatchObject({
      id: "split",
      durationMs: 30 * 60 * 1000,
      continuesFromPrevious: true,
    });

    const week = buildWeeklyTimesheet({
      date: "2026-10-09",
      timeZone: "America/Los_Angeles",
      entries: rows,
    });
    expect(week.dates[0]).toBe("2026-10-05");
    const website = week.rows.find((row) => row.projectId === "project-1");
    const api = week.rows.find((row) => row.projectId === "project-2");
    expect(website?.dayMs[4]).toBe(30 * 60 * 1000);
    expect(website?.dayMs[5]).toBe(30 * 60 * 1000);
    expect(website?.totalMs).toBe(60 * 60 * 1000);
    expect(api?.dayMs[4]).toBe(60 * 60 * 1000);
    expect(week.columnTotals[4]).toBe(90 * 60 * 1000);
    expect(week.columnTotals[5]).toBe(30 * 60 * 1000);
    expect(week.totalMs).toBe(2 * 60 * 60 * 1000);
  });

  it("keeps an entry just inside the previous local week off this week's grid", () => {
    const sundayNight = entry({
      id: "sunday",
      startedAt: new Date("2026-10-05T06:30:00.000Z"),
      endedAt: new Date("2026-10-05T07:00:00.000Z"),
    });
    const week = buildWeeklyTimesheet({
      date: "2026-10-09",
      timeZone: "America/Los_Angeles",
      entries: [sundayNight],
    });
    const previous = buildWeeklyTimesheet({
      date: "2026-10-04",
      timeZone: "America/Los_Angeles",
      entries: [sundayNight],
    });
    expect(week.totalMs).toBe(0);
    expect(previous.dates[6]).toBe("2026-10-04");
    expect(previous.totalMs).toBe(30 * 60 * 1000);
    expect(previous.columnTotals[6]).toBe(30 * 60 * 1000);
  });

  it("formats durations and empty states with the shared copy", () => {
    expect(formatTrackedDuration(0)).toBe("0m");
    expect(formatTrackedDuration(45_000)).toBe("45s");
    expect(formatTrackedDuration(5 * 60_000)).toBe("5m");
    expect(formatTrackedDuration(60 * 60_000)).toBe("1h");
    expect(formatTrackedDuration(65 * 60_000)).toBe("1h 05m");
    expect(formatElapsed(3_661_000)).toBe("01:01:01");
    expect(timesheetEmptyCopy({ view: "day", filtered: false })).toEqual({
      title: timeCopy.dailyEmptyTitle,
      body: timeCopy.dailyEmptyBody,
      clearLabel: null,
    });
    expect(timesheetEmptyCopy({ view: "week", filtered: true }).body).toBe(
      timeCopy.weeklyFilterBody,
    );
    expect(timesheetsHref({ view: "week", date: "2026-10-09", notice: "overlap" })).toBe(
      "/timesheets?view=week&date=2026-10-09&notice=overlap",
    );
  });
});
