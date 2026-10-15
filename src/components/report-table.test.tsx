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
            billable: "all",
            groupBy: "project",
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
    container.remove();
  });
});
