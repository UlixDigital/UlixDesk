import { formatMoney } from "@/lib/money";
import { rateCopy, rateHistoryLine } from "@/lib/rate-copy";
import { formatCivilDate } from "@/lib/time-zone";

export function RateHistory({
  rows,
  empty,
}: {
  rows: Array<{
    id: string;
    userName: string | null;
    amountMinor: number;
    currency: string;
    effectiveFrom: string;
  }>;
  empty: string;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-slate-800">{rateCopy.historyTitle}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{empty}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500">{rateCopy.historyRule}</p>
          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {rows.map((row) => {
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
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
