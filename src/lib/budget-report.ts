import { budgetCopy, budgetNoAmount } from "@/lib/budget-copy";
import type { BudgetFigures } from "@/lib/budget-period";
import type { BudgetReportRow } from "@/lib/budgets";
import { toCsv } from "@/lib/csv";
import type { PdfTable } from "@/lib/report-pdf";

export function budgetReportCsv(rows: BudgetReportRow[], showMoney: boolean) {
  if (!showMoney) {
    const header = [
      budgetCopy.colName,
      budgetCopy.colType,
      budgetCopy.colPeriod,
      `${budgetCopy.colBudget} (${budgetCopy.hoursUnit})`,
      `${budgetCopy.colUsed} (${budgetCopy.hoursUnit})`,
      `${budgetCopy.colRemaining} (${budgetCopy.hoursUnit})`,
      budgetCopy.colPercent,
      budgetCopy.colStatus,
    ];
    return toCsv([
      header,
      ...rows.map((row) => [
        row.name,
        row.typeLabel,
        row.periodLabel,
        hourCell(row, "budget"),
        hourCell(row, "used"),
        hourCell(row, "remaining"),
        percentCell(row),
        row.status,
      ]),
    ]);
  }
  const header = [
    budgetCopy.colName,
    budgetCopy.colType,
    budgetCopy.colBasis,
    budgetCopy.colCurrency,
    budgetCopy.colPeriod,
    budgetCopy.colBudget,
    budgetCopy.colUsed,
    budgetCopy.colRemaining,
    budgetCopy.colPercent,
    budgetCopy.colStatus,
  ];
  return toCsv([
    header,
    ...rows.map((row) => [
      row.name,
      row.typeLabel,
      row.basis === "hours" ? budgetCopy.basisHours : budgetCopy.basisCost,
      row.currency ?? "",
      row.periodLabel,
      numberCell(row, "budget"),
      numberCell(row, "used"),
      numberCell(row, "remaining"),
      percentCell(row),
      row.status,
    ]),
  ]);
}

function hourCell(row: BudgetReportRow, kind: "budget" | "used" | "remaining") {
  return stripUnit(cell(row.figures, kind));
}

function numberCell(row: BudgetReportRow, kind: "budget" | "used" | "remaining") {
  if (row.basis === "hours") return stripUnit(cell(row.figures, kind));
  return moneyCell(row, kind);
}

function cell(figures: BudgetFigures, kind: "budget" | "used" | "remaining") {
  if (kind === "budget") return figures.budgetLabel;
  if (kind === "used") return figures.usedLabel;
  return figures.remainingLabel;
}

function stripUnit(label: string) {
  return label.replace(` ${budgetCopy.hoursUnit}`, "").replaceAll(budgetNoAmount, "").trim();
}

function moneyCell(row: BudgetReportRow, kind: "budget" | "used" | "remaining") {
  const label = cell(row.figures, kind);
  if (!row.currency || label.includes(budgetNoAmount) && !/\d/.test(label)) return "";
  if (label.includes(budgetNoAmount) && kind !== "budget") return "";
  const amount = label.replace(`${row.currency} `, "").replaceAll(",", "");
  const numeric = amount.replace(budgetNoAmount, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return "";
  return numeric;
}

function percentCell(row: BudgetReportRow) {
  if (row.figures.percentTenths === null) return "";
  const tenths = row.figures.percentTenths;
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? String(whole) : `${whole}.${frac}`;
}

export function budgetReportTable(rows: BudgetReportRow[], showMoney: boolean): PdfTable {
  if (!showMoney) {
    return {
      columns: [
        { label: budgetCopy.colName, align: "left" },
        { label: budgetCopy.colPeriod, align: "left" },
        { label: budgetCopy.colBudget, align: "right" },
        { label: budgetCopy.colUsed, align: "right" },
        { label: budgetCopy.colRemaining, align: "right" },
        { label: budgetCopy.colPercent, align: "right" },
        { label: budgetCopy.colStatus, align: "left" },
      ],
      rows: rows.map((row) => [
        row.name,
        row.periodLabel,
        row.figures.budgetLabel,
        row.figures.usedLabel,
        row.figures.remainingLabel,
        row.figures.percentLabel,
        row.status,
      ]),
      totals: null,
    };
  }
  return {
    columns: [
      { label: budgetCopy.colName, align: "left" },
      { label: budgetCopy.colType, align: "left" },
      { label: budgetCopy.colPeriod, align: "left" },
      { label: budgetCopy.colBudget, align: "right" },
      { label: budgetCopy.colUsed, align: "right" },
      { label: budgetCopy.colRemaining, align: "right" },
      { label: budgetCopy.colPercent, align: "right" },
      { label: budgetCopy.colStatus, align: "left" },
    ],
    rows: rows.map((row) => [
      row.name,
      row.typeLabel,
      row.periodLabel,
      row.figures.budgetLabel,
      row.figures.usedLabel,
      row.figures.remainingLabel,
      row.figures.percentLabel,
      row.status,
    ]),
    totals: null,
  };
}

/** Guard: a member file has no currency code and no cost wording. */
export function budgetCsvHasMoney(csv: string) {
  return /\b(?:USD|EUR|GBP|JPY|LKR|AUD|CAD|NZD|BHD)\b|\$|¥|€|£/.test(csv);
}
