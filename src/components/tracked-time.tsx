import { MoneySummary } from "@/components/money-summary";
import { rateCopy } from "@/lib/rate-copy";
import { timeCopy } from "@/lib/time-copy";
import type { MoneyTotal } from "@/lib/money";
import { formatTrackedDuration } from "@/lib/timesheet";

export function TrackedTime({
  milliseconds,
  money = null,
}: {
  milliseconds: number;
  money?: { totals: MoneyTotal[]; unrated: boolean } | null;
}) {
  return (
    <section
      aria-label={timeCopy.trackedTitle}
      className="rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:px-6"
    >
      <h2 className="text-sm font-medium text-slate-500">{timeCopy.trackedTitle}</h2>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
        {formatTrackedDuration(milliseconds)}
      </p>
      {money && (money.totals.length > 0 || money.unrated) ? (
        <div className="mt-3">
          <h3 className="text-sm font-medium text-slate-500">{rateCopy.trackedAmountLabel}</h3>
          <MoneySummary totals={money.totals} unrated={money.unrated} />
        </div>
      ) : null}
      <p className="mt-2 text-sm text-slate-600">{timeCopy.trackedHint}</p>
    </section>
  );
}
