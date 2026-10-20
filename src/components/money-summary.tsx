import { formatMoney, formatMoneyTotals, type MoneyTotal } from "@/lib/money";
import { rateCopy } from "@/lib/rate-copy";

export function MoneySummary({
  totals,
  unrated,
}: {
  totals: MoneyTotal[];
  unrated: boolean;
}) {
  if (totals.length === 0 && !unrated) return null;
  const lines = formatMoneyTotals(totals);
  return (
    <div className="mt-1 text-sm text-slate-600">
      {lines.length > 0 ? (
        <div>
          <p className="font-medium text-ink">{rateCopy.billablePrefix}</p>
          {lines.map((line) => (
            <p key={line} className="whitespace-nowrap">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {unrated ? <p>{rateCopy.unrated}</p> : null}
    </div>
  );
}

export function MoneyAmount({ amount }: { amount: MoneyTotal | null }) {
  if (!amount) {
    return (
      // The hidden label is positioned against this span. Without that, it
      // sits at the far edge of a wide timesheet and makes the page scroll.
      <span className="relative whitespace-nowrap text-slate-500">
        —<span className="sr-only"> {rateCopy.noAmount}</span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatMoney(amount.amountMinor, amount.currency)}
    </span>
  );
}
