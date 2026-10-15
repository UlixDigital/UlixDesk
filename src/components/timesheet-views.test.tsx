/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { rateCopy } from "@/lib/rate-copy";
import { buildWeeklyTimesheet, type TimesheetEntry } from "@/lib/timesheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { WeeklyTimesheet } from "@/components/timesheet-views";

function entry(
  overrides: Partial<TimesheetEntry> & Pick<TimesheetEntry, "id" | "projectId" | "projectName">,
): TimesheetEntry {
  return {
    projectArchived: false,
    clientId: "client-1",
    clientName: "Acme",
    userId: "user-1",
    startedAt: new Date("2026-10-10T09:00:00.000Z"),
    endedAt: new Date("2026-10-10T10:00:00.000Z"),
    billable: true,
    projectBillable: true,
    rate: null,
    note: null,
    source: "manual",
    ...overrides,
  };
}

describe("weekly timesheet amounts", () => {
  it("matches the day view for a missing rate and a non-billable day", async () => {
    const week = buildWeeklyTimesheet({
      date: "2026-10-09",
      timeZone: "UTC",
      entries: [
        entry({ id: "none", projectId: "none", projectName: "QA NoRate proj", clientName: "QA NoRate Co" }),
        entry({
          id: "off",
          projectId: "off",
          projectName: "QA P3 nonbill",
          clientName: "QA USD Co",
          projectBillable: false,
          rate: { amountMinor: 10000, currency: "USD" },
        }),
        entry({
          id: "rated",
          projectId: "rated",
          projectName: "QA P1",
          startedAt: new Date("2026-10-09T09:00:00.000Z"),
          endedAt: new Date("2026-10-09T09:01:00.000Z"),
          rate: { amountMinor: 10000, currency: "USD" },
        }),
      ],
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(WeeklyTimesheet, {
          dates: week.dates,
          today: "2026-10-15",
          rows: week.rows,
          columnTotals: week.columnTotals,
          columnMoney: week.columnMoney,
          totalMs: week.totalMs,
          moneyTotals: week.moneyTotals,
          unrated: week.unrated,
          showMoney: true,
          canManage: false,
          projectId: "",
          clientId: "",
        }),
      );
    });

    const table = container.querySelector("table")!;
    expect(table.className).toContain("table-fixed");
    expect(table.querySelector("th")?.className).toContain("sticky");
    const cols = [...table.querySelectorAll("col")];
    expect(cols).toHaveLength(9);
    expect(cols[0].className).toContain("w-44");
    expect(cols[8].className).toContain("w-28");
    expect(cols.slice(1, 8).every((col) => col.className === "")).toBe(true);

    const body = [...table.querySelectorAll("tbody tr")];
    const noRate = body.find((row) => row.textContent?.includes("QA NoRate proj"))!;
    const nonBill = body.find((row) => row.textContent?.includes("QA P3 nonbill"))!;
    const rated = body.find((row) => row.textContent?.includes("QA P1"))!;
    const saturday = (row: Element) => row.querySelectorAll("td")[5];

    expect(saturday(noRate).textContent).toContain("1h");
    expect(saturday(noRate).textContent).toContain("—");
    expect(saturday(noRate).querySelector(".sr-only")?.textContent).toContain(rateCopy.noAmount);
    expect(saturday(noRate).textContent).not.toContain(rateCopy.nonBillable);

    expect(saturday(nonBill).textContent).toContain(rateCopy.nonBillable);
    expect(saturday(nonBill).querySelector(".sr-only")?.textContent).toContain(rateCopy.noAmount);

    expect(rated.querySelectorAll("td")[4].textContent).toContain("USD 1.67");
    expect(rated.querySelectorAll("td")[4].textContent).not.toContain(rateCopy.noAmount);
    expect(rated.querySelectorAll("td")[4].querySelector("span")?.className).toContain(
      "whitespace-nowrap",
    );

    const totalCell = (row: Element) => row.querySelectorAll("td")[7];
    expect(totalCell(noRate).textContent).toContain("1h");
    expect(totalCell(noRate).textContent).toContain("—");
    expect(totalCell(noRate).querySelector(".sr-only")?.textContent).toContain(rateCopy.noAmount);
    expect(totalCell(noRate).textContent).not.toContain(rateCopy.nonBillable);
    expect(totalCell(nonBill).textContent).toContain(rateCopy.nonBillable);
    expect(totalCell(nonBill).querySelector(".sr-only")?.textContent).toContain(rateCopy.noAmount);
    expect(totalCell(rated).textContent).toContain("USD 1.67");
    expect(totalCell(rated).querySelector(".whitespace-nowrap")?.textContent).toContain("USD 1.67");

    const footer = table.querySelectorAll("tfoot td");
    expect(footer[0].textContent?.trim()).toBe("—");
    expect(footer[0].textContent).not.toContain("0m");
    expect(footer[4].textContent).toContain("1m");
    expect(footer[5].textContent).toContain("2h");
    expect(footer[5].textContent).toContain(rateCopy.noAmount);
    expect(footer[5].textContent).toContain(rateCopy.nonBillable);
    expect(footer[7].textContent).toContain(rateCopy.noAmount);
    expect(footer[7].textContent).toContain(rateCopy.nonBillable);

    const stacked = document.createElement("div");
    document.body.append(stacked);
    const stackedRoot = createRoot(stacked);
    const moneyRow = {
      ...week.rows[0],
      projectId: "multi",
      projectName: "Multi currency",
      totalMoney: [
        { currency: "USD", amountMinor: 125050 },
        { currency: "JPY", amountMinor: 1500 },
      ],
      dayMoney: week.rows[0].dayMs.map(() => []),
      dayNoAmount: week.rows[0].dayMs.map(() => false),
      dayNonBillable: week.rows[0].dayMs.map(() => false),
    };
    await act(async () => {
      stackedRoot.render(
        createElement(WeeklyTimesheet, {
          dates: week.dates,
          today: "2026-10-15",
          rows: [moneyRow],
          columnTotals: week.columnTotals,
          columnMoney: week.columnMoney,
          totalMs: moneyRow.totalMs,
          moneyTotals: moneyRow.totalMoney,
          showMoney: true,
          canManage: true,
          projectId: "",
          clientId: "",
        }),
      );
    });
    const total = [...stacked.querySelectorAll("tbody td")].at(-1)!;
    const amounts = [...total.querySelectorAll(".whitespace-nowrap")].map((node) => node.textContent);
    expect(amounts).toEqual(["USD 1,250.50", "JPY 1,500"]);
    expect(total.textContent).not.toContain(" · ");
    stackedRoot.unmount();
    stacked.remove();

    expect(container.querySelector('a[href^="/projects/"]')).toBeNull();
    expect(saturday(noRate).querySelector("a")?.getAttribute("href")).toContain("/timesheets?");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
