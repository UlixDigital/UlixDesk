import { describe, expect, it } from "vitest";
import {
  parseReportSearchParams,
  rangeForPreset,
  reportHref,
  resolveColumns,
} from "@/lib/report-query";
import { zonedDayEnd } from "@/lib/time-zone";

describe("report query", () => {
  const today = "2026-10-15";

  it("resolves presets in the workspace calendar", () => {
    expect(rangeForPreset("today", today)).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(rangeForPreset("this-week", today)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(rangeForPreset("last-week", today)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(rangeForPreset("this-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(rangeForPreset("last-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(rangeForPreset("last-month", "2026-03-01").to).toBe("2026-02-28");
  });

  it("uses the first repeated value and clamps a year that would not resolve", () => {
    const parsed = parseReportSearchParams(
      {
        preset: ["custom", "today"],
        from: ["2026-10-01", "1990-01-01"],
        to: ["9999-12-31", "2026-10-02"],
        member: ["sam", "jane"],
        billable: ["non-billable", "billable"],
        group: ["client", "date"],
        page: ["2", "9"],
        columns: ["hours,amount", "notes"],
      },
      today,
    );
    expect(parsed.rangeError).toBe(false);
    expect(parsed.query).toMatchObject({
      preset: "custom",
      from: "2026-10-01",
      to: "2100-12-31",
      memberId: "sam",
      billable: "non-billable",
      groupBy: "client",
      page: 2,
      columns: ["hours", "amount"],
    });
    expect(() => zonedDayEnd(parsed.query.to, "Asia/Colombo")).not.toThrow();
    expect(reportHref("daily", parsed.query)).toBe(
      "/reports/daily?preset=custom&from=2026-10-01&to=2100-12-31&member=sam&billable=non-billable&group=client&columns=hours%2Camount&page=2",
    );
  });

  it("drops amount columns for members and keeps the defaults when columns are absent", () => {
    expect(resolveColumns("time-activity", null, false, false)).toEqual(["hours", "billableHours"]);
    expect(resolveColumns("time-activity", ["hours", "amount", "member"], false, false)).toEqual([
      "hours",
    ]);
    expect(resolveColumns("work-sessions", null, true, true)).toContain("member");
    expect(resolveColumns("work-sessions", null, false, false)).not.toContain("member");
  });
});
