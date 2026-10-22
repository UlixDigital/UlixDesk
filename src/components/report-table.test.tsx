/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { BuiltReport } from "@/lib/reports";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { ReportTable } from "@/components/report-table";

const report: BuiltReport = {
  columns: [
    { id: "group", label: "Project" },
    { id: "hours", label: "Hours" },
    { id: "amount:USD", label: "Amount (USD)" },
    { id: "noAmount", label: "No amount" },
  ],
  rows: [
    {
      id: "1",
      cells: { group: "Website", hours: "1h", "amount:USD": "USD 50.00", noAmount: "" },
    },
  ],
  totals: { group: "Total", hours: "1h", "amount:USD": "USD 50.00", noAmount: "" },
  csv: { columns: [], rows: [], totals: null },
  totalRows: 1,
  page: 1,
  pageCount: 1,
  pageSize: 50,
};

describe("report table", () => {
  it("right-aligns amount columns", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(
        createElement(ReportTable, {
          kind: "time-activity",
          query: {
            preset: "this-week",
            from: "2026-10-12",
            to: "2026-10-18",
            memberId: "",
            clientId: "",
            projectId: "",
            todoId: "",
            billable: "all",
            groupBy: "project",
            groupBy2: null,
            sort: { key: "name", direction: "asc", currency: null },
            columns: ["hours", "amount"],
            page: 1,
          },
          report,
          filtered: false,
        }),
      );
    });
    const headers = [...container.querySelectorAll("th")].map((cell) => cell.className);
    expect(headers[0]).not.toContain("text-right");
    expect(headers[2]).toContain("text-right");
    expect(headers[3]).toContain("text-right");
    const amountCell = [...container.querySelectorAll("td")].find((cell) =>
      cell.textContent?.includes("USD 50.00"),
    );
    expect(amountCell?.className).toContain("text-right");
    const sorted = container.querySelector('[aria-sort="ascending"]');
    expect(sorted?.textContent).toContain("Project");
    expect(sorted?.textContent).toContain("↑");
    const hoursLink = [...container.querySelectorAll("a")].find((link) => link.textContent?.includes("Hours"));
    expect(hoursLink?.getAttribute("href")).toContain("sort=time-desc");
    expect(hoursLink?.getAttribute("href")).toContain("group=project");
    container.remove();
  });

  it("shows a date sort arrow when the table has no Date column", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(
        createElement(ReportTable, {
          kind: "time-activity",
          query: {
            preset: "this-week",
            from: "2026-10-12",
            to: "2026-10-18",
            memberId: "",
            clientId: "",
            projectId: "",
            todoId: "",
            billable: "all",
            groupBy: "project",
            groupBy2: null,
            sort: { key: "date", direction: "desc", currency: null },
            columns: ["hours"],
            page: 1,
          },
          report,
          filtered: false,
        }),
      );
    });
    const sorted = container.querySelector('[aria-sort="descending"]');
    expect(sorted?.textContent).toContain("Project");
    expect(sorted?.textContent).toContain("↓");
    expect(sorted?.textContent).toContain("Date newest");
    const totals = container.querySelectorAll("[data-row-kind=grand-total]");
    expect(totals).toHaveLength(2);
    expect(totals[0]?.textContent).toContain("Total");
    expect(container.querySelector("tfoot")?.textContent).toContain("Total");
    container.remove();
  });
});
