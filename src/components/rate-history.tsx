import { formatMoney } from "@/lib/money";
import { collapseRateHistory, currentRateIds } from "@/lib/rate-history";
import { rateCopy, rateHistoryLine } from "@/lib/rate-copy";
import { formatCivilDate } from "@/lib/time-zone";

export function RateHistory({
  rows,
  empty,
  today,
}: {
  rows: Array<{
    id: string;
    userId: string | null;
    userName: string | null;
    amountMinor: number;
    currency: string;
    effectiveFrom: string;
  }>;
  empty: string;
  today: string;
}) {
  const visible = collapseRateHistory(rows);
  const current = new Set(currentRateIds(visible, today));
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-slate-800">{rateCopy.historyTitle}</h3>
      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{empty}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500">{rateCopy.historyRule}</p>
          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {visible.map((row) => {
              const line = rateHistoryLine(
                formatMoney(row.amountMinor, row.currency),
                formatCivilDate(row.effectiveFrom, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              );
              return (
                <li key={row.id} className="px-3 py-2 text-sm text-ink">
                  {row.userName ? `${row.userName} · ${line}` : line}
                  {current.has(row.id) ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-accent">
                      {rateCopy.currentBadge}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
