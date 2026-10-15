import { describe, expect, it } from "vitest";
import {
  clampCalendarDate,
  firstSearchParam,
  parseBoundedDate,
  parseEnumParam,
  parsePageParam,
} from "@/lib/search-params";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

describe("search params", () => {
  it("keeps the first value when a key is repeated", () => {
    expect(firstSearchParam(["edited", "deleted"])).toBe("edited");
    expect(firstSearchParam("today")).toBe("today");
    expect(firstSearchParam(undefined)).toBe("");
    expect(firstSearchParam(["", "later"])).toBe("");
    expect(parsePageParam(["2", "9"])).toBe(2);
    expect(parsePageParam("0")).toBe(1);
    expect(parseEnumParam(["billable", "all"], ["all", "billable", "non-billable"])).toBe(
      "billable",
    );
    expect(parseEnumParam(["nope", "billable"], ["billable"])).toBeNull();
  });

  it("clamps years into 2000–2100 so the day bounds can be resolved", () => {
    expect(clampCalendarDate("9999-12-31")).toBe("2100-12-31");
    expect(clampCalendarDate("1999-06-15")).toBe("2000-06-15");
    expect(clampCalendarDate("2104-02-29")).toBe("2100-02-28");
    expect(clampCalendarDate("2026-10-15")).toBe("2026-10-15");
    expect(clampCalendarDate("not-a-date")).toBeNull();
    expect(parseBoundedDate(["9999-12-31", "2026-01-01"], "2026-10-12")).toBe("2100-12-31");
    expect(parseBoundedDate("nope", "2026-10-12")).toBe("2026-10-12");

    const to = parseBoundedDate("9999-12-31", "2026-10-18");
    expect(() => zonedDayStart("2000-01-01", "Asia/Colombo")).not.toThrow();
    expect(() => zonedDayEnd(to, "Asia/Colombo")).not.toThrow();
    expect(() => zonedDayEnd(to, "UTC")).not.toThrow();
  });
});
