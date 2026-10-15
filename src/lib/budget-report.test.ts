import { describe, expect, it } from "vitest";
import { budgetCopy } from "@/lib/budget-copy";
import { budgetCsvHasMoney, budgetReportCsv, budgetReportTable } from "@/lib/budget-report";
import type { BudgetFigures } from "@/lib/budget-period";
import type { BudgetReportRow } from "@/lib/budgets";

function figures(overrides: Partial<BudgetFigures> = {}): BudgetFigures {
  return {
    budgetLabel: "1.00 hours",
    usedLabel: "0.50 hours",
    remainingLabel: "0.50 hours",
    percentLabel: "50%",
    percentTenths: 500,
    warning: false,
    reached: false,
    unrated: false,
    blocks: false,
    notStarted: false,
    ...overrides,
  };
}

function row(overrides: Partial<BudgetReportRow> = {}): BudgetReportRow {
  return {
    id: "budget-1",
    name: "Website",
    typeLabel: budgetCopy.typeProject,
    basis: "hours",
    currency: null,
    periodLabel: "Total",
    figures: figures(),
    status: budgetCopy.statusOnTrack,
    archived: false,
    ...overrides,
  };
}

describe("budget report export", () => {
  it("keeps currency out of a member file", () => {
    const csv = budgetReportCsv([row()], false);
    expect(csv).toContain("Website");
    expect(csv).toContain("0.50");
    expect(budgetCsvHasMoney(csv)).toBe(false);
    expect(csv).not.toContain("Currency");
    const table = budgetReportTable([row()], false);
    expect(table.columns.map((column) => column.label)).not.toContain(budgetCopy.colType);
    expect(table.rows.flat().join(" ")).not.toMatch(/USD|EUR/);
  });

  it("leaves used, remaining, and percent empty when cost is unrated", () => {
    const csv = budgetReportCsv(
      [
        row({
          basis: "cost",
          currency: "USD",
          status: budgetCopy.statusNoRate,
          figures: figures({
            budgetLabel: "USD 100.00",
            usedLabel: "USD 40.00 —",
            remainingLabel: "—",
            percentLabel: "—",
            percentTenths: null,
            unrated: true,
          }),
        }),
      ],
      true,
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Currency");
    expect(lines[1]).toContain("No rate");
    expect(lines[1]).not.toContain("—");
    const cells = lines[1].split(",");
    expect(cells[5]).toBe("100.00");
    expect(cells[6]).toBe("");
    expect(cells[7]).toBe("");
    expect(cells[8]).toBe("");
  });
});
