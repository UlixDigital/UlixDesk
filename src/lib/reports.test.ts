import { describe, expect, it } from "vitest";
import { reportCopy } from "@/lib/report-copy";
import { rateCopy } from "@/lib/rate-copy";
import { buildReport, reportToCsv, slicesForEntry, type SourceEntry } from "@/lib/reports";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

function entry(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    id: "e1",
    userId: "sam",
    userName: "Sam",
    projectId: "website",
    projectName: "Website",
    clientId: "acme",
    clientName: "Acme",
    startedAt: new Date("2026-10-12T09:00:00.000Z"),
    endedAt: new Date("2026-10-12T10:00:00.000Z"),
    billable: true,
    projectBillable: true,
    note: "Called the client",
    rate: { amountMinor: 1000, currency: "USD" },
    ...overrides,
  };
}

const range = {
  rangeStart: zonedDayStart("2026-10-12", "UTC"),
  rangeEnd: zonedDayEnd("2026-10-18", "UTC"),
  timeZone: "UTC",
};

describe("report totals", () => {
  it("splits midnight, keeps currencies apart, and omits money for members", () => {
    const overnight = entry({
      id: "night",
      startedAt: new Date("2026-10-12T22:00:00.000Z"),
      endedAt: new Date("2026-10-13T02:00:00.000Z"),
      rate: { amountMinor: 10000, currency: "USD" },
    });
    const slices = slicesForEntry(overnight, range.rangeStart, range.rangeEnd, "UTC");
    expect(slices.map((slice) => [slice.date, slice.durationMs])).toEqual([
      ["2026-10-12", 2 * 60 * 60 * 1000],
      ["2026-10-13", 2 * 60 * 60 * 1000],
    ]);

    const yen = entry({
      id: "yen",
      projectId: "brochure",
      projectName: "Brochure",
      clientId: "tokyo",
      clientName: "Tokyo",
      userId: "jane",
      userName: "Jane",
      startedAt: new Date("2026-10-12T10:00:00.000Z"),
      endedAt: new Date("2026-10-12T11:00:00.000Z"),
      rate: { amountMinor: 1500, currency: "JPY" },
    });
    const off = entry({
      id: "off",
      projectId: "internal",
      projectName: "Internal",
      clientId: null,
      clientName: null,
      billable: false,
      projectBillable: false,
      rate: { amountMinor: 1000, currency: "USD" },
      startedAt: new Date("2026-10-11T23:00:00.000Z"),
      endedAt: new Date("2026-10-12T01:00:00.000Z"),
    });
    const missing = entry({
      id: "missing",
      projectId: "plain",
      projectName: "Plain",
      rate: null,
      startedAt: new Date("2026-10-14T09:00:00.000Z"),
      endedAt: new Date("2026-10-14T10:00:00.000Z"),
    });

    const owner = buildReport({
      kind: "time-activity",
      entries: [overnight, yen, off, missing],
      ...range,
      groupBy: "client",
      columns: ["hours", "billableHours", "amount"],
      showMoney: true,
      manager: true,
    });
    const acme = owner.rows.find((row) => row.cells.group === "Acme");
    const tokyo = owner.rows.find((row) => row.cells.group === "Tokyo");
    const none = owner.rows.find((row) => row.cells.group === reportCopy.noClient);
    expect(acme?.cells.hours).toBe("5h");
    expect(acme?.cells.billableHours).toBe("5h");
    expect(acme?.cells["amount:USD"]).toBe("USD 400.00");
    expect(acme?.cells["amount:JPY"]).toBe("");
    expect(tokyo?.cells["amount:JPY"]).toBe("JPY 1,500");
    expect(tokyo?.cells["amount:USD"]).toBe("");
    expect(none?.cells.hours).toBe("1h");
    expect(none?.cells.billableHours).toBe("0m");
    expect(owner.totals?.["amount:USD"]).toBe("USD 400.00");
    expect(owner.totals?.["amount:JPY"]).toBe("JPY 1,500");
    expect(owner.totals?.hours).toBe("7h");
    expect(owner.totals?.billableHours).toBe("6h");
    expect(owner.columns.map((column) => column.label)).toContain("Amount (USD)");
    expect(owner.columns.map((column) => column.label)).toContain("Amount (JPY)");
    expect(owner.rows.some((row) => row.cells.noAmount === reportCopy.noAmount)).toBe(true);

    const member = buildReport({
      kind: "time-activity",
      entries: [overnight, yen],
      ...range,
      groupBy: "project",
      columns: ["hours", "billableHours", "amount"],
      showMoney: false,
      manager: false,
    });
    expect(member.columns.map((column) => column.id).join(" ")).not.toContain("amount");
    expect(reportToCsv(member)).not.toMatch(/USD|JPY|Amount/);
    const csv = reportToCsv(owner);
    expect(csv).toContain("Hours (decimal)");
    expect(csv).toContain("Billable hours (decimal)");
    expect(csv).toContain("Amount (USD)");
    expect(csv).toContain("Amount (JPY)");
    expect(csv).toContain("Status");
    expect(csv).toContain("5.0000");
    expect(csv).toContain("400.00");
    expect(csv).toContain("1500");
    expect(csv).toContain(reportCopy.statusNoRate);
    expect(csv).toContain(reportCopy.statusNonBillable);
    expect(csv).toContain(reportCopy.statusBillable);
    expect(csv).not.toContain("USD 400.00");
    expect(csv).not.toContain("JPY 1,500");
    expect(csv).not.toContain(reportCopy.noAmount);
    expect(csv.split("\r\n").at(-2)).not.toMatch(/No rate|Non-billable|Billable/);
  });

  it("buckets weeks Monday through Sunday and lists work sessions", () => {
    const sunday = entry({
      id: "sun",
      startedAt: new Date("2026-10-11T12:00:00.000Z"),
      endedAt: new Date("2026-10-11T13:00:00.000Z"),
    });
    const monday = entry({
      id: "mon",
      startedAt: new Date("2026-10-12T12:00:00.000Z"),
      endedAt: new Date("2026-10-12T13:30:00.000Z"),
      note: "=cmd",
    });
    const weekly = buildReport({
      kind: "weekly",
      entries: [sunday, monday],
      rangeStart: zonedDayStart("2026-10-05", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-18", "UTC"),
      timeZone: "UTC",
      groupBy: "date",
      columns: ["hours", "billableHours", "amount"],
      showMoney: true,
      manager: true,
    });
    expect(weekly.rows.map((row) => row.id)).toEqual(["\t2026-10-05", "\t2026-10-12"]);
    expect(weekly.rows[0]?.cells.hours).toBe("1h");
    expect(weekly.rows[1]?.cells.hours).toBe("1h 30m");

    const sessions = buildReport({
      kind: "work-sessions",
      entries: [sunday, monday],
      rangeStart: zonedDayStart("2026-10-05", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-18", "UTC"),
      timeZone: "UTC",
      groupBy: "date",
      columns: ["start", "end", "duration", "project", "client", "notes", "billable"],
      showMoney: false,
      manager: false,
      page: 1,
    });
    expect(sessions.totalRows).toBe(2);
    expect(sessions.rows[0]?.cells.notes).toBe("Called the client");
    expect(sessions.rows[1]?.cells.notes).toBe("=cmd");
    expect(sessions.rows[1]?.cells.billable).toBe(rateCopy.billablePrefix);
    expect(sessions.rows[1]?.cells.duration).toBe("1h 30m");
    const sessionCsv = reportToCsv(sessions);
    expect(sessionCsv).toContain("Duration (decimal)");
    expect(sessionCsv).toContain("1.5000");
    expect(sessionCsv).toContain("'=cmd");
    expect(sessionCsv).not.toContain("1h 30m");
  });

  it("keeps notes as typed, sorts sessions by start, and totals a day once", () => {
    const later = entry({
      id: "later",
      note: "  keep spaces  ",
      startedAt: new Date("2026-10-14T11:00:00.000Z"),
      endedAt: new Date("2026-10-14T12:00:00.000Z"),
    });
    const earlier = entry({
      id: "earlier",
      note: "",
      startedAt: new Date("2026-10-14T09:00:00.000Z"),
      endedAt: new Date("2026-10-14T10:00:00.000Z"),
    });
    const sessions = buildReport({
      kind: "work-sessions",
      entries: [later, earlier],
      rangeStart: zonedDayStart("2026-10-14", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-14", "UTC"),
      timeZone: "UTC",
      groupBy: "project",
      columns: ["start", "notes"],
      showMoney: false,
      manager: false,
    });
    expect(sessions.rows.map((row) => row.id)).toEqual(["earlier", "later"]);
    expect(sessions.rows[0]?.cells.notes).toBe("—");
    expect(sessions.rows[1]?.cells.notes).toBe("  keep spaces  ");
    const csv = reportToCsv(sessions);
    expect(csv).toContain("  keep spaces  ");
    expect(csv).not.toContain("—");

    const other = entry({
      id: "other-day",
      projectId: "other",
      projectName: "Other",
      startedAt: new Date("2026-10-14T09:00:00.000Z"),
      endedAt: new Date("2026-10-14T10:00:00.000Z"),
    });
    const daily = buildReport({
      kind: "daily",
      entries: [later, other],
      rangeStart: zonedDayStart("2026-10-14", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-14", "UTC"),
      timeZone: "UTC",
      groupBy: "date",
      columns: ["hours"],
      showMoney: false,
      manager: false,
    });
    expect(daily.rows).toHaveLength(1);
    expect(daily.rows[0]?.cells.hours).toBe("2h");
    const breakdown = buildReport({
      kind: "daily",
      entries: [later, other],
      rangeStart: zonedDayStart("2026-10-14", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-14", "UTC"),
      timeZone: "UTC",
      groupBy: "project",
      columns: ["hours"],
      showMoney: false,
      manager: false,
    });
    expect(breakdown.rows).toHaveLength(2);
    expect(breakdown.columns.map((column) => column.id)).toContain("bucket");
  });
});
