import { describe, expect, it } from "vitest";
import { timeCopy } from "@/lib/time-copy";
import {
  billableDefault,
  emptyTimeEntryFormValues,
  intervalError,
  intervalsOverlap,
  validateTimeEntryInput,
} from "@/lib/time-validation";

const now = new Date("2026-10-09T18:00:00.000Z");

function values(overrides: Partial<ReturnType<typeof emptyTimeEntryFormValues>> = {}) {
  return {
    ...emptyTimeEntryFormValues("UTC", "2026-10-09"),
    projectId: "project-1",
    startTime: "09:00",
    endTime: "10:00",
    ...overrides,
  };
}

describe("validateTimeEntryInput", () => {
  it("accepts a same-day range and trims the note", () => {
    const result = validateTimeEntryInput(
      values({ note: "  Deep work  ", billable: false }),
      now,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.startedAt.toISOString()).toBe("2026-10-09T09:00:00.000Z");
    expect(result.data.endedAt.toISOString()).toBe("2026-10-09T10:00:00.000Z");
    expect(result.data.note).toBe("Deep work");
    expect(result.data.billable).toBe(false);
  });

  it("requires a project", () => {
    const result = validateTimeEntryInput(values({ projectId: "  " }), now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.projectId).toBe(timeCopy.projectRequired);
  });

  it("rolls an earlier or equal To onto the next day", () => {
    const overnight = validateTimeEntryInput(
      values({
        date: "2026-10-08",
        startTime: "23:00",
        endTime: "00:30",
      }),
      now,
    );
    const fullDay = validateTimeEntryInput(
      values({
        date: "2026-10-08",
        startTime: "09:00",
        endTime: "09:00",
      }),
      now,
    );
    expect(overnight.ok).toBe(true);
    expect(fullDay.ok).toBe(true);
    if (!overnight.ok || !fullDay.ok) return;
    expect(overnight.data.startedAt.toISOString()).toBe("2026-10-08T23:00:00.000Z");
    expect(overnight.data.endedAt.toISOString()).toBe("2026-10-09T00:30:00.000Z");
    expect(fullDay.data.endedAt.getTime() - fullDay.data.startedAt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("rejects an overnight end that is still in the future", () => {
    const result = validateTimeEntryInput(
      values({ startTime: "23:00", endTime: "00:30" }),
      now,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.endTime).toBe(timeCopy.futureEnd);
    expect(result.values.endDate).toBe("2026-10-10");
  });

  it("rejects an explicit end date that is not after the start", () => {
    const result = validateTimeEntryInput(
      values({
        date: "2026-10-08",
        endDate: "2026-10-07",
        startTime: "10:00",
        endTime: "11:00",
      }),
      now,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.endTime).toBe(timeCopy.endAfterStart);
  });

  it("rejects a rolled fall-back midnight that runs longer than 24 hours", () => {
    const result = validateTimeEntryInput(
      values({
        timeZone: "America/New_York",
        date: "2026-11-01",
        startTime: "00:00",
        endTime: "00:00",
      }),
      new Date("2026-11-03T12:00:00.000Z"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.endTime).toBe(timeCopy.tooLong);
  });

  it("rejects a rolled end that falls in a spring-forward gap", () => {
    const result = validateTimeEntryInput(
      values({
        timeZone: "America/New_York",
        date: "2026-03-07",
        startTime: "03:00",
        endTime: "02:30",
      }),
      new Date("2026-03-10T12:00:00.000Z"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.endTime).toBe(timeCopy.invalidTime);
  });

  it("rejects an end time in the future and allows an end time equal to now", () => {
    const future = validateTimeEntryInput(
      values({ startTime: "17:30", endTime: "18:30" }),
      now,
    );
    const exact = validateTimeEntryInput(
      values({ startTime: "17:00", endTime: "18:00" }),
      now,
    );
    expect(future.ok).toBe(false);
    if (future.ok) return;
    expect(future.errors.endTime).toBe(timeCopy.futureEnd);
    expect(exact.ok).toBe(true);
  });

  it("allows exactly 24 hours and rejects anything longer", () => {
    const exactly = intervalError({
      startedAt: new Date("2026-10-08T18:00:00.000Z"),
      endedAt: new Date("2026-10-09T18:00:00.000Z"),
      now,
    });
    const over = intervalError({
      startedAt: new Date("2026-10-08T17:59:59.999Z"),
      endedAt: new Date("2026-10-09T18:00:00.000Z"),
      now,
    });
    expect(exactly).toBeNull();
    expect(over).toBe("too-long");
  });

  it("rejects a fall-back local day that runs longer than 24 hours", () => {
    const result = validateTimeEntryInput(
      values({
        timeZone: "America/New_York",
        date: "2026-11-01",
        startTime: "00:00",
        endTime: "23:59",
      }),
      new Date("2026-11-02T12:00:00.000Z"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.endTime).toBe(timeCopy.tooLong);
  });

  it("allows a 24-hour span on that same fall-back day", () => {
    const result = validateTimeEntryInput(
      values({
        timeZone: "America/New_York",
        date: "2026-11-01",
        startTime: "00:00",
        endTime: "23:00",
      }),
      new Date("2026-11-02T12:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.endedAt.getTime() - result.data.startedAt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("rejects a time that does not exist during spring forward", () => {
    const result = validateTimeEntryInput(
      values({
        timeZone: "America/New_York",
        date: "2026-03-08",
        startTime: "02:30",
        endTime: "03:30",
      }),
      new Date("2026-03-09T12:00:00.000Z"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.startTime).toBe(timeCopy.invalidTime);
  });

  it("counts a 2000-character note after turning CRLF into LF", () => {
    const note = "a\r\n".repeat(999) + "ab";
    expect(note.length).toBe(2999);
    const result = validateTimeEntryInput(values({ note }), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.note).toBe(`${"a\n".repeat(999)}ab`);
    expect(result.data.note?.length).toBe(2000);

    const over = validateTimeEntryInput(
      values({ note: `${"a\n".repeat(1000)}b` }),
      now,
    );
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.errors.note).toBe(timeCopy.noteTooLong);
  });

  it("rejects an invalid date, an invalid time, and a note that is too long", () => {
    const result = validateTimeEntryInput(
      values({
        date: "2026-02-31",
        startTime: "25:00",
        endTime: "",
        note: "x".repeat(2001),
      }),
      now,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.date).toBe(timeCopy.invalidDate);
    expect(result.errors.startTime).toBe(timeCopy.invalidTime);
    expect(result.errors.endTime).toBe(timeCopy.invalidTime);
    expect(result.errors.note).toBe(timeCopy.noteTooLong);
  });

  it("treats touching ranges as separate and overlapping ranges as overlaps", () => {
    const morningEnd = new Date("2026-10-09T10:00:00.000Z");
    const nextStart = new Date("2026-10-09T10:00:00.000Z");
    expect(
      intervalsOverlap(
        new Date("2026-10-09T09:00:00.000Z"),
        morningEnd,
        nextStart,
        new Date("2026-10-09T11:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      intervalsOverlap(
        new Date("2026-10-09T09:00:00.000Z"),
        new Date("2026-10-09T10:30:00.000Z"),
        new Date("2026-10-09T10:00:00.000Z"),
        new Date("2026-10-09T11:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("defaults billable from the selected project", () => {
    const projects = [
      { id: "a", billable: true },
      { id: "b", billable: false },
    ];
    expect(billableDefault(projects, "b")).toBe(false);
    expect(billableDefault(projects, "a")).toBe(true);
    expect(billableDefault(projects, "")).toBe(true);
  });
});
