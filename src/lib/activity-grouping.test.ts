import { describe, expect, it } from "vitest";
import {
  buildActivityTree,
  compareActivityGroups,
  nextColumnSort,
  scopeActivityView,
  sortArrowColumnId,
  type ActivityNode,
  type ActivitySlice,
} from "@/lib/activity-grouping";
import { reportCopy } from "@/lib/report-copy";
import {
  activitySortToken,
  parseActivitySort,
  parseReportSearchParams,
  reportHref,
} from "@/lib/report-query";
import { builtReportToTable, pdfPlainText, renderReportPdf } from "@/lib/report-pdf";
import { buildReport, reportToCsv, scopedReportUserId, type SourceEntry } from "@/lib/reports";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

const hour = 60 * 60 * 1000;

function slice(overrides: Partial<ActivitySlice> = {}): ActivitySlice {
  return {
    userId: "ada",
    userName: "Ada",
    projectId: "web",
    projectName: "Website",
    clientId: "acme",
    clientName: "Acme",
    todoId: "brief",
    todoTitle: "Write the brief",
    date: "2026-10-12",
    durationMs: 2 * hour,
    billableMs: 2 * hour,
    amount: { currency: "USD", amountMinor: 2000 },
    unrated: false,
    ...overrides,
  };
}

function node(overrides: Partial<ActivityNode> = {}): ActivityNode {
  return {
    id: "a",
    label: "Ada",
    minDate: "2026-10-12",
    maxDate: "2026-10-12",
    durationMs: hour,
    billableMs: hour,
    amounts: [{ currency: "USD", amountMinor: 1000 }],
    unrated: false,
    children: [],
    ...overrides,
  };
}

const nameAsc = { key: "name" as const, direction: "asc" as const, currency: null };

describe("activity grouping", () => {
  const adaWeb = slice();
  const adaBrochure = slice({
    projectId: "brochure",
    projectName: "Brochure",
    clientId: "tokyo",
    clientName: "Tokyo",
    todoId: "",
    todoTitle: "",
    date: "2026-10-14",
    durationMs: hour,
    billableMs: 0,
    amount: { currency: "JPY", amountMinor: 1500 },
  });
  const benWeb = slice({
    userId: "ben",
    userName: "Ben",
    date: "2026-10-13",
    durationMs: hour,
    billableMs: hour,
    amount: { currency: "USD", amountMinor: 500 },
  });

  it("rolls subtotals up each group and sorts children the same way", () => {
    const tree = buildActivityTree({
      slices: [adaWeb, adaBrochure, benWeb],
      groupBy: "member",
      groupBy2: "project",
      sort: { key: "time", direction: "desc", currency: null },
    });
    expect(tree.map((group) => group.label)).toEqual(["Ada", "Ben"]);
    expect(tree[0]?.durationMs).toBe(3 * hour);
    expect(tree[0]?.billableMs).toBe(2 * hour);
    expect(tree[0]?.amounts).toEqual([
      { currency: "JPY", amountMinor: 1500 },
      { currency: "USD", amountMinor: 2000 },
    ]);
    expect(tree[0]?.children.map((child) => [child.label, child.durationMs])).toEqual([
      ["Website", 2 * hour],
      ["Brochure", hour],
    ]);
    expect(tree[1]?.children.map((child) => child.label)).toEqual(["Website"]);
    expect(tree.reduce((sum, group) => sum + group.durationMs, 0)).toBe(4 * hour);
  });

  it("groups by to-do, including time that has none", () => {
    const tree = buildActivityTree({
      slices: [adaWeb, adaBrochure],
      groupBy: "todo",
      groupBy2: null,
      sort: nameAsc,
    });
    expect(tree.map((group) => group.label)).toEqual(["(No to-do)", "Write the brief"]);
  });

  it("sorts by name, time, date, and one currency at a time", () => {
    const ada = node({ id: "ada", label: "Ada", durationMs: 3 * hour, maxDate: "2026-10-14", minDate: "2026-10-12" });
    const ben = node({
      id: "ben",
      label: "Ben",
      durationMs: hour,
      minDate: "2026-10-15",
      maxDate: "2026-10-15",
      amounts: [{ currency: "JPY", amountMinor: 9000 }],
    });
    const adaNode = { ...ada, amounts: [{ currency: "USD", amountMinor: 2000 }, { currency: "JPY", amountMinor: 1500 }] };
    expect(compareActivityGroups(ben, ada, { key: "name", direction: "asc", currency: null })).toBeGreaterThan(0);
    expect(compareActivityGroups(ben, ada, { key: "name", direction: "desc", currency: null })).toBeLessThan(0);
    expect(compareActivityGroups(ada, ben, { key: "time", direction: "desc", currency: null })).toBeLessThan(0);
    expect(compareActivityGroups(ada, ben, { key: "time", direction: "asc", currency: null })).toBeGreaterThan(0);
    expect(compareActivityGroups(ada, ben, { key: "date", direction: "desc", currency: null })).toBeGreaterThan(0);
    expect(compareActivityGroups(adaNode, ben, { key: "amount", direction: "desc", currency: "USD" })).toBeLessThan(0);
    expect(compareActivityGroups(adaNode, ben, { key: "amount", direction: "desc", currency: "JPY" })).toBeGreaterThan(0);
    const combined = compareActivityGroups(adaNode, ben, { key: "amount", direction: "desc", currency: null });
    expect(combined).toBeGreaterThan(0);
  });

  it("toggles a column and points the arrow at that column", () => {
    const columns = [
      { id: "group" },
      { id: "group2" },
      { id: "hours" },
      { id: "amount:USD" },
      { id: "amount:JPY" },
    ];
    const current = { key: "name" as const, direction: "asc" as const, currency: null };
    expect(
      nextColumnSort({ current, columnId: "hours", groupBy: "member", groupBy2: "project" }),
    ).toEqual({ key: "time", direction: "desc", currency: null });
    expect(
      nextColumnSort({
        current: { key: "time", direction: "desc", currency: null },
        columnId: "hours",
        groupBy: "member",
        groupBy2: "project",
      }),
    ).toEqual({ key: "time", direction: "asc", currency: null });
    expect(
      nextColumnSort({ current, columnId: "amount:USD", groupBy: "member", groupBy2: "date" }),
    ).toEqual({ key: "amount", direction: "desc", currency: "USD" });
    expect(
      nextColumnSort({ current, columnId: "group2", groupBy: "member", groupBy2: "date" })?.key,
    ).toBe("date");
    expect(nextColumnSort({ current, columnId: "noAmount", groupBy: "member", groupBy2: null })).toBeNull();
    expect(sortArrowColumnId(columns, "member", "project", current)).toBe("group");
    expect(
      sortArrowColumnId(columns, "member", "project", { key: "amount", direction: "desc", currency: "JPY" }),
    ).toBe("amount:JPY");
    expect(
      sortArrowColumnId(columns, "member", "date", { key: "date", direction: "desc", currency: null }),
    ).toBe("group2");
  });

  it("keeps members off member grouping and amount sorts", () => {
    expect(scopedReportUserId({ id: "mia", role: "member" }, "owner")).toBe("mia");
    expect(scopedReportUserId({ id: "olivia", role: "owner" }, "mia")).toBe("mia");
    expect(scopedReportUserId({ id: "olivia", role: "admin" }, null)).toBeNull();
    expect(
      scopeActivityView({
        kind: "time-activity",
        manager: false,
        showMoney: false,
        groupBy: "member",
        groupBy2: "member",
        sort: { key: "amount", direction: "desc", currency: "USD" },
      }),
    ).toEqual({
      groupBy: "project",
      groupBy2: null,
      sort: nameAsc,
    });
    expect(
      scopeActivityView({
        kind: "time-activity",
        manager: true,
        showMoney: true,
        groupBy: "member",
        groupBy2: "member",
        sort: { key: "amount", direction: "desc", currency: "USD" },
      }),
    ).toMatchObject({ groupBy: "member", groupBy2: null, sort: { key: "amount", currency: "USD" } });
    expect(
      scopeActivityView({
        kind: "daily",
        manager: false,
        showMoney: false,
        groupBy: "member",
        groupBy2: "project",
        sort: { key: "time", direction: "desc", currency: null },
      }).groupBy,
    ).toBe("date");
  });
});

describe("activity report rows", () => {
  const range = {
    rangeStart: zonedDayStart("2026-10-12", "UTC"),
    rangeEnd: zonedDayEnd("2026-10-18", "UTC"),
    timeZone: "UTC",
  };

  function entry(overrides: Partial<SourceEntry> = {}): SourceEntry {
    return {
      id: "e1",
      userId: "ada",
      userName: "Ada",
      projectId: "web",
      projectName: "Website",
      clientId: "acme",
      clientName: "Acme",
      startedAt: new Date("2026-10-12T09:00:00.000Z"),
      endedAt: new Date("2026-10-12T11:00:00.000Z"),
      billable: true,
      projectBillable: true,
      note: "",
      todoId: "brief",
      todoTitle: "Write the brief",
      rate: { amountMinor: 1000, currency: "USD" },
      ...overrides,
    };
  }

  it("prints subtotals, the child rows, and a grand total in sort order", async () => {
    const report = buildReport({
      kind: "time-activity",
      entries: [
        entry(),
        entry({
          id: "e2",
          projectId: "brochure",
          projectName: "Brochure",
          startedAt: new Date("2026-10-14T09:00:00.000Z"),
          endedAt: new Date("2026-10-14T10:00:00.000Z"),
          rate: { amountMinor: 1500, currency: "JPY" },
        }),
        entry({
          id: "e3",
          userId: "ben",
          userName: "Ben",
          startedAt: new Date("2026-10-13T09:00:00.000Z"),
          endedAt: new Date("2026-10-13T10:00:00.000Z"),
        }),
      ],
      ...range,
      groupBy: "member",
      groupBy2: "project",
      sort: { key: "time", direction: "desc", currency: null },
      columns: ["hours", "billableHours", "amount"],
      showMoney: true,
      manager: true,
    });
    expect(report.rows.map((row) => [row.kind, row.cells.group, row.cells.group2, row.cells.hours])).toEqual([
      ["subtotal", "Ada", "", "3h"],
      ["group", "", "Website", "2h"],
      ["group", "", "Brochure", "1h"],
      ["subtotal", "Ben", "", "1h"],
      ["group", "", "Website", "1h"],
    ]);
    expect(report.totals?.group).toBe(reportCopy.grandTotal);
    expect(report.totals?.hours).toBe("4h");
    expect(report.totals?.["amount:USD"]).toBe("USD 30.00");
    const csv = reportToCsv(report);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Member,Project,Hours (decimal)");
    expect(lines[1]).toBe("Ada,,3.0000,3.0000,1500,20.00,");
    expect(lines[2]).toContain("Website,2.0000");
    expect(lines[2]).toContain("Billable");
    expect(lines.at(-1)).toBe("Grand total,,4.0000,4.0000,1500,30.00,");
    expect(lines[1]).not.toMatch(/Billable|No rate/);

    const scoped = scopeActivityView({
      kind: "time-activity",
      manager: false,
      showMoney: false,
      groupBy: "member",
      groupBy2: "project",
      sort: { key: "amount", direction: "desc", currency: "USD" },
    });
    const member = buildReport({
      kind: "time-activity",
      entries: [entry({ rate: null })],
      ...range,
      groupBy: scoped.groupBy,
      groupBy2: scoped.groupBy2,
      sort: scoped.sort,
      columns: ["hours", "amount"],
      showMoney: false,
      manager: false,
    });
    expect(member.columns.map((column) => column.id).join(" ")).not.toContain("amount");
    expect(reportToCsv(member)).not.toMatch(/USD|JPY|Amount/);
    expect(member.rows.map((row) => row.cells.group)).toEqual(["Website"]);

    const pdf = await renderReportPdf({
      title: "Time & Activity",
      filters: ["Group by: Member", "Then by: Project", "Sort: Total time high to low"],
      table: builtReportToTable(report),
      compress: false,
    });
    const text = pdfPlainText(pdf);
    expect(text).toContain("Ada");
    expect(text).toContain("Website");
    expect(text).toContain("Grand total");
    expect(text).toContain("USD 30.00");
    expect(text).not.toMatch(/Screenshot|Activity %/);
  });
});

describe("activity view url", () => {
  const today = "2026-10-15";

  it("reads the first group, second group, and sort", () => {
    const parsed = parseReportSearchParams(
      {
        group: ["member", "date"],
        then: ["project", "client"],
        sort: ["time-desc", "name-asc"],
      },
      today,
      "time-activity",
    );
    expect(parsed.viewInUrl).toBe(true);
    expect(parsed.query.groupBy).toBe("member");
    expect(parsed.query.groupBy2).toBe("project");
    expect(activitySortToken(parsed.query.sort)).toBe("time-desc");
    expect(reportHref("time-activity", parsed.query)).toBe(
      "/reports/time-activity?group=member&then=project&sort=time-desc",
    );
    expect(parseActivitySort("amount-USD-asc")).toEqual({
      key: "amount",
      direction: "asc",
      currency: "USD",
    });
    expect(parseActivitySort("amount-usd-desc")).toBeNull();
    expect(parseActivitySort("name-USD-asc")).toBeNull();
    expect(parseActivitySort(["nope", "time-desc"])).toBeNull();
    const bare = parseReportSearchParams({}, today, "time-activity");
    expect(bare.viewInUrl).toBe(false);
    expect(bare.query.groupBy2).toBeNull();
    expect(activitySortToken(bare.query.sort)).toBe("name-asc");
    expect(reportHref("time-activity", bare.query)).toBe("/reports/time-activity?group=project&sort=name-asc");
  });
});
