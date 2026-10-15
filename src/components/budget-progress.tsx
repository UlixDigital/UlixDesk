import { budgetCopy } from "@/lib/budget-copy";
import type { BudgetProgress } from "@/lib/budgets";

export function BudgetProgressView({ progress }: { progress: BudgetProgress }) {
  const { figures } = progress;
  const width =
    figures.percentTenths === null ? 0 : Math.min(100, figures.percentTenths / 10);
  const tone = figures.reached ? "bg-rose-600" : figures.warning ? "bg-amber-500" : "bg-primary-700";
  return (
    <div
      id="budget-progress"
      data-budget-status={progress.status}
      data-budget-warning={figures.warning ? "true" : "false"}
      className={
        figures.warning
          ? "rounded-xl border border-amber-300 bg-amber-50 p-4"
          : "rounded-xl border border-slate-200 bg-slate-50 p-4"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          {budgetCopy.usedLabel} {figures.usedLabel}
          <span className="text-slate-500">
            {" "}
            {budgetCopy.ofLabel} {figures.budgetLabel}
          </span>
        </p>
        <p className="text-sm font-semibold tabular-nums text-ink">{figures.percentLabel}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {budgetCopy.remainingLabel}: {figures.remainingLabel}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {budgetCopy.periodLabel}: {progress.periodLabel}.{" "}
        {progress.record.billableOnly ? budgetCopy.billableNote : budgetCopy.allTimeNote}
      </p>
      {progress.record.hardStop ? (
        <p className="mt-1 text-xs text-slate-500">{budgetCopy.hardStopOn}</p>
      ) : null}
      {figures.unrated ? <p className="mt-1 text-xs text-slate-600">{budgetCopy.unratedNote}</p> : null}
      {figures.notStarted ? (
        <p className="mt-2 text-sm text-slate-700">{budgetCopy.notStarted}</p>
      ) : null}
      {figures.warning ? (
        <p role="alert" className="mt-2 text-sm font-medium text-amber-950">
          {figures.reached ? budgetCopy.reached : budgetCopy.warning(figures.percentLabel)}
        </p>
      ) : null}
    </div>
  );
}
