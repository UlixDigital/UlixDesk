import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isRealCalendarDate,
  startOfWeekDate,
  todayInTimeZone,
  weekDates,
  zonedDateTimeToUtc,
  zonedDayEnd,
  zonedDayStart,
  zonedParts,
} from "@/lib/time-zone";

describe("time zones", () => {
  it("keeps a late local evening on that local day, not the UTC day", () => {
    const start = zonedDateTimeToUtc(
      "2026-10-09",
      "23:30",
      "America/Los_Angeles",
    );
    expect(start?.toISOString()).toBe("2026-10-10T06:30:00.000Z");
    expect(zonedParts(start!, "America/Los_Angeles").date).toBe("2026-10-09");
    expect(zonedParts(start!, "UTC").date).toBe("2026-10-10");

    const dayStart = zonedDayStart("2026-10-09", "America/Los_Angeles");
    const dayEnd = zonedDayEnd("2026-10-09", "America/Los_Angeles");
    expect(start! >= dayStart && start! < dayEnd).toBe(true);

    const utcDayStart = zonedDayStart("2026-10-09", "UTC");
    const utcDayEnd = zonedDayEnd("2026-10-09", "UTC");
    expect(start! >= utcDayStart && start! < utcDayEnd).toBe(false);
    expect(
      start! >= zonedDayStart("2026-10-10", "UTC") &&
        start! < zonedDayEnd("2026-10-10", "UTC"),
    ).toBe(true);
  });

  it("starts the week on Monday and walks calendar dates across months", () => {
    expect(startOfWeekDate("2026-10-09")).toBe("2026-10-05");
    expect(weekDates("2026-10-09")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(startOfWeekDate("2026-10-04")).toBe("2026-09-28");
  });

  it("rejects a spring-forward gap and keeps the earlier fall-back instant", () => {
    expect(
      zonedDateTimeToUtc("2026-03-08", "02:30", "America/New_York"),
    ).toBeNull();

    const first = zonedDateTimeToUtc("2026-11-01", "01:30", "America/New_York");
    expect(first?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(zonedParts(first!, "America/New_York").time).toBe("01:30");
  });

  it("reads today from the requested zone rather than the host zone", () => {
    const now = new Date("2026-10-10T06:30:00.000Z");
    expect(todayInTimeZone("America/Los_Angeles", now)).toBe("2026-10-09");
    expect(todayInTimeZone("UTC", now)).toBe("2026-10-10");
  });

  it("rejects calendar dates that do not exist", () => {
    expect(isRealCalendarDate("2026-02-31")).toBe(false);
    expect(isRealCalendarDate("2026-10-09")).toBe(true);
  });
});
