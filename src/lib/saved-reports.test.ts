import { describe, expect, it } from "vitest";
import { reportCopy } from "@/lib/report-copy";
import {
  canChangeSavedReport,
  canReadSavedReport,
  parseSavedReportName,
  parseSavedVisibility,
  parseStoredReportParams,
  savedReportHref,
  scopeStoredParams,
} from "@/lib/saved-reports";

const today = "2026-10-15";

describe("saved report params", () => {
  it("keeps a canonical string object and drops unknown keys and bad ids", () => {
    const parsed = parseStoredReportParams(
      "time-activity",
      {
        preset: "custom",
        from: "0004-02-29",
        to: "2104-02-29",
        member: "sam_1",
        client: "not an id",
        project: "",
        billable: "billable",
        group: "client",
        columns: "hours,amount",
        evil: "1",
      },
      today,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.params).toEqual({
      preset: "custom",
      from: "2000-01-01",
      to: "2100-12-31",
      member: "sam_1",
      billable: "billable",
      group: "client",
      columns: "hours,amount",
    });
  });

  it("fails closed on a non-string value, an array, or an unknown type", () => {
    expect(parseStoredReportParams("time-activity", { preset: 1 }, today).ok).toBe(false);
    expect(parseStoredReportParams("time-activity", ["preset"], today).ok).toBe(false);
    expect(parseStoredReportParams("invoice", { preset: "today" }, today).ok).toBe(false);
  });

  it("stores columns even when they are empty, and freezes time edit dates", () => {
    const report = parseStoredReportParams("daily", {}, today);
    expect(report.ok && report.params.columns).toBe("");
    expect(report.ok && report.params.group).toBeUndefined();
    const edits = parseStoredReportParams(
      "manual-time-edits",
      { from: "1999-06-15", to: "2026-10-18", action: "timer", member: "bad id" },
      today,
    );
    expect(edits.ok).toBe(true);
    if (!edits.ok) return;
    expect(edits.params).toEqual({ from: "2000-01-01", to: "2026-10-18", action: "timer" });
  });

  it("scopes a member to their own rows and blocks sharing", () => {
    const scoped = scopeStoredParams(
      { id: "mia", role: "member" },
      "time-activity",
      { member: "owner", group: "member", columns: "hours,amount,billableHours" },
    );
    expect(scoped).toEqual({ columns: "hours,billableHours" });
    expect(parseSavedVisibility("shared", "member")).toEqual({
      ok: false,
      code: "SAVED_REPORT_SHARE",
      error: reportCopy.cannotShare,
    });
    expect(parseSavedVisibility("shared", "admin")).toEqual({ ok: true, visibility: "shared" });
    expect(parseSavedVisibility("", "member")).toEqual({ ok: true, visibility: "private" });
  });

  it("opens a shared report without the member filter for a member", () => {
    const href = savedReportHref(
      "time-activity",
      { preset: "custom", from: "2026-10-01", to: "2026-10-31", member: "owner", columns: "hours" },
      { includeMember: false },
    );
    expect(href).toBe("/reports/time-activity?preset=custom&from=2026-10-01&to=2026-10-31&columns=hours");
    expect(href).not.toContain("member=");
  });

  it("collapses the name and enforces the length", () => {
    expect(parseSavedReportName("  October   activity  ")).toEqual({
      ok: true,
      name: "October activity",
    });
    expect(parseSavedReportName("   ").ok).toBe(false);
    expect(parseSavedReportName("a".repeat(81)).ok).toBe(false);
  });

  it("lets the creator change a private report, and an owner change a shared one", () => {
    const creator = { id: "mia", role: "member" };
    const owner = { id: "olivia", role: "owner" };
    const privateReport = { createdById: "mia", visibility: "private" };
    const sharedReport = { createdById: "mia", visibility: "shared" };
    expect(canChangeSavedReport(creator, privateReport)).toBe(true);
    expect(canChangeSavedReport(owner, privateReport)).toBe(false);
    expect(canReadSavedReport(owner, privateReport)).toBe(false);
    expect(canChangeSavedReport(owner, sharedReport)).toBe(true);
    expect(canReadSavedReport(owner, sharedReport)).toBe(true);
    expect(canChangeSavedReport({ id: "sam", role: "member" }, sharedReport)).toBe(false);
    expect(canReadSavedReport({ id: "sam", role: "member" }, sharedReport)).toBe(true);
  });
});
