import { describe, expect, it } from "vitest";
import { timeCopy } from "@/lib/time-copy";
import { zonedDateTimeToUtc } from "@/lib/time-zone";
import {
  buildDailyTimesheet,
  buildWeeklyTimesheet,
  formatElapsed,
  formatTrackedDuration,
  overnightDurationNotice,
  runningEntryForDay,
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
    userId: "user-1",
    billable: true,
    projectBillable: true,
    rate: null,
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
    expect(timeCopy.continuesNext).toBe("Continues into the next day");
    expect(timeCopy.continuesPrevious).toBe("Continues from the previous day");
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
    expect(website?.continuesToNext[4]).toBe(true);
    expect(website?.continuesFromPrevious[5]).toBe(true);
    expect(website?.continuesFromPrevious[4]).toBe(false);
    expect(website?.continuesToNext[5]).toBe(false);
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

  it("warns when a rolled entry is longer than 12 hours and keeps the short hint at 12 hours", () => {
    const hour = 60 * 60 * 1000;
    expect(overnightDurationNotice(true, 23 * hour)).toEqual({
      hint: null,
      warning: "This entry is 23h long and ends the next day. Check the times.",
    });
    expect(overnightDurationNotice(true, 12 * hour)).toEqual({
      hint: timeCopy.endsNextDay,
      warning: null,
    });
    expect(overnightDurationNotice(true, 90 * 60 * 1000)).toEqual({
      hint: timeCopy.endsNextDay,
      warning: null,
    });
    expect(overnightDurationNotice(false, 23 * hour)).toEqual({
      hint: null,
      warning: null,
    });
  });

  it("shows a running timer on the days it overlaps without adding it to completed totals", () => {
    const running = {
      id: "run-1",
      projectId: "project-1",
      projectName: "Website",
      projectArchived: false,
      clientId: "client-1",
      clientName: "Acme",
      startedAt: new Date("2026-10-09T15:00:00.000Z"),
      billable: true,
      note: "Draft",
    };
    const now = new Date("2026-10-09T15:30:00.000Z");
    const today = runningEntryForDay({
      date: "2026-10-09",
      timeZone: "UTC",
      now,
      entry: running,
    });
    expect(today).toMatchObject({
      id: "run-1",
      startLabel: "3:00 PM",
      startedAt: "2026-10-09T15:00:00.000Z",
      continuesFromPrevious: false,
      continuesToNext: false,
    });
    expect(
      runningEntryForDay({
        date: "2026-10-08",
        timeZone: "UTC",
        now,
        entry: running,
      }),
    ).toBeNull();
    expect(
      runningEntryForDay({
        date: "2026-10-09",
        timeZone: "UTC",
        now,
        entry: running,
        projectId: "other-project",
      }),
    ).toBeNull();
    expect(
      runningEntryForDay({
        date: "2026-10-09",
        timeZone: "UTC",
        now,
        entry: running,
        clientId: "other-client",
      }),
    ).toBeNull();

    const stillRunningYesterday = runningEntryForDay({
      date: "2026-10-08",
      timeZone: "UTC",
      now: new Date("2026-10-09T15:30:00.000Z"),
      entry: {
        ...running,
        startedAt: new Date("2026-10-08T23:00:00.000Z"),
      },
    });
    expect(stillRunningYesterday?.continuesToNext).toBe(true);
    expect(stillRunningYesterday?.startLabel).toBe("11:00 PM");

    const completed = buildDailyTimesheet({
      date: "2026-10-09",
      timeZone: "UTC",
      entries: [],
    });
    expect(completed.rows).toEqual([]);
    expect(completed.totalMs).toBe(0);
  });

  it("groups billable amounts by currency and leaves a missing rate blank", () => {
    const rows = [
      entry({
        id: "usd",
        startedAt: new Date("2026-10-09T09:00:00.000Z"),
        endedAt: new Date("2026-10-09T10:00:00.000Z"),
        rate: { amountMinor: 5000, currency: "USD" },
      }),
      entry({
        id: "lkr",
        projectId: "project-2",
        projectName: "Brand",
        startedAt: new Date("2026-10-09T11:00:00.000Z"),
        endedAt: new Date("2026-10-09T12:00:00.000Z"),
        rate: { amountMinor: 800000, currency: "LKR" },
      }),
      entry({
        id: "missing",
        projectId: "project-3",
        projectName: "Internal",
        startedAt: new Date("2026-10-09T13:00:00.000Z"),
        endedAt: new Date("2026-10-09T14:00:00.000Z"),
        rate: null,
      }),
      entry({
        id: "off",
        projectId: "project-4",
        projectName: "Free",
        startedAt: new Date("2026-10-09T15:00:00.000Z"),
        endedAt: new Date("2026-10-09T16:00:00.000Z"),
        projectBillable: false,
        rate: { amountMinor: 5000, currency: "USD" },
      }),
    ];
    const daily = buildDailyTimesheet({ date: "2026-10-09", timeZone: "UTC", entries: rows });
    expect(daily.moneyTotals).toEqual([
      { currency: "LKR", amountMinor: 800000 },
      { currency: "USD", amountMinor: 5000 },
    ]);
    expect(daily.unrated).toBe(true);
    expect(daily.rows.find((row) => row.id === "missing")?.amount).toBeNull();
    expect(daily.rows.find((row) => row.id === "off")?.amount).toBeNull();
    expect(daily.rows.find((row) => row.id === "off")?.billable).toBe(false);
  });
});

function at(date: string, time: string, timeZone: string) {
  const instant = zonedDateTimeToUtc(date, time, timeZone);
  if (!instant) throw new Error(`${date} ${time} does not exist in ${timeZone}`);
  return instant;
}

describe("workspace-local day assignment", () => {
  const colombo = "Asia/Colombo";

  it("counts 00:00 and 03:00 Colombo on the new local day, and 23:59 on the day before", () => {
    const eleven = entry({
      id: "eleven",
      startedAt: at("2026-01-31", "23:59", colombo),
      endedAt: at("2026-02-01", "00:00", colombo),
    });
    const late = entry({
      id: "late",
      startedAt: new Date(at("2026-02-01", "00:00", colombo).getTime() - 1),
      endedAt: at("2026-02-01", "00:00", colombo),
    });
    const midnight = entry({
      id: "midnight",
      startedAt: at("2026-02-01", "00:00", colombo),
      endedAt: at("2026-02-01", "01:00", colombo),
    });
    const three = entry({
      id: "three",
      startedAt: at("2026-02-01", "03:00", colombo),
      endedAt: at("2026-02-01", "04:00", colombo),
    });
    expect(three.startedAt.toISOString().slice(0, 10)).toBe("2026-01-31");

    const previous = buildDailyTimesheet({
      date: "2026-01-31",
      timeZone: colombo,
      entries: [eleven, late, midnight, three],
    });
    expect(previous.rows.map((row) => row.id)).toEqual(["eleven", "late"]);

    const next = buildDailyTimesheet({
      date: "2026-02-01",
      timeZone: colombo,
      entries: [eleven, late, midnight, three],
    });
    expect(next.rows.map((row) => row.id)).toEqual(["midnight", "three"]);

    const week = buildWeeklyTimesheet({
      date: "2026-02-01",
      timeZone: colombo,
      entries: [eleven, late, midnight, three],
    });
    const row = week.rows[0];
    expect(week.dates[5]).toBe("2026-01-31");
    expect(week.dates[6]).toBe("2026-02-01");
    expect(row.dayMs[5]).toBeGreaterThan(0);
    expect(row.dayMs[6]).toBe(2 * 3_600_000);
  });

  it("assigns a New York spring-forward morning to the short local day", () => {
    const zone = "America/New_York";
    const before = entry({
      id: "before",
      startedAt: at("2026-03-07", "23:30", zone),
      endedAt: at("2026-03-07", "23:59", zone),
    });
    const morning = entry({
      id: "morning",
      startedAt: at("2026-03-08", "03:00", zone),
      endedAt: at("2026-03-08", "04:00", zone),
    });
    const march7 = buildDailyTimesheet({ date: "2026-03-07", timeZone: zone, entries: [before, morning] });
    const march8 = buildDailyTimesheet({ date: "2026-03-08", timeZone: zone, entries: [before, morning] });
    expect(march7.rows.map((row) => row.id)).toEqual(["before"]);
    expect(march8.rows.map((row) => row.id)).toEqual(["morning"]);
    expect(march8.rows[0].durationMs).toBe(3_600_000);
    expect(march8.totalMs).toBe(3_600_000);
  });
});
