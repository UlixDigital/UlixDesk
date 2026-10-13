import { describe, expect, it } from "vitest";
import { decideBadge } from "./badge";
import { badgeText, formatElapsed } from "./time";

const startedAt = "2026-10-10T05:00:00.000Z";
const startMs = Date.parse(startedAt);

describe("elapsed time and badge", () => {
  it("formats elapsed time like the header timer", () => {
    expect(formatElapsed(0)).toBe("00:00:00");
    expect(formatElapsed(1_000)).toBe("00:00:01");
    expect(formatElapsed(3_661_000)).toBe("01:01:01");
    expect(formatElapsed(-5)).toBe("00:00:00");
  });

  it("shows a dot under a minute and whole minutes after that", () => {
    expect(badgeText(startedAt, startMs + 59_000)).toBe("•");
    expect(badgeText(startedAt, startMs + 60_000)).toBe("1");
    expect(badgeText(startedAt, startMs + 90_000)).toBe("1");
    expect(badgeText(startedAt, startMs + 1_440 * 60_000)).toBe("1440");
    expect(badgeText(startedAt, startMs + 10_000 * 60_000)).toBe("9999");
    expect(badgeText("not-a-date", startMs)).toBe("•");
  });

  it("clears the badge unless a permitted timer is confirmed", () => {
    const timer = { startedAt, projectName: "Website" };
    expect(
      decideBadge({
        configured: true,
        permission: true,
        failure: null,
        timer,
        now: startMs + 120_000,
      }),
    ).toEqual({ action: "set", text: "2" });
    expect(
      decideBadge({
        configured: false,
        permission: true,
        failure: null,
        timer,
        now: startMs,
      }).action,
    ).toBe("clear");
    expect(
      decideBadge({
        configured: true,
        permission: false,
        failure: null,
        timer,
        now: startMs,
      }).action,
    ).toBe("clear");
    expect(
      decideBadge({
        configured: true,
        permission: true,
        failure: "unreachable",
        timer,
        now: startMs,
      }).action,
    ).toBe("keep");
    expect(
      decideBadge({
        configured: true,
        permission: true,
        failure: "unauthorized",
        timer,
        now: startMs,
      }).action,
    ).toBe("clear");
    expect(
      decideBadge({
        configured: true,
        permission: true,
        failure: null,
        timer: null,
        now: startMs,
      }).action,
    ).toBe("clear");
  });
});
