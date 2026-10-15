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
  return (
    <div className="mt-1 text-sm text-slate-600">
      {totals.length > 0 ? (
        <p>
          <span className="font-medium text-ink">{rateCopy.billablePrefix}</span>{" "}
          {formatMoneyTotals(totals).join(" · ")}
        </p>
      ) : null}
      {unrated ? <p>{rateCopy.unrated}</p> : null}
    </div>
  );
}

export function MoneyAmount({ amount }: { amount: MoneyTotal | null }) {
  if (!amount) {
    return (
      <span className="text-slate-500">
        —<span className="sr-only"> {rateCopy.noAmount}</span>
      </span>
    );
  }
  return <span className="tabular-nums">{formatMoney(amount.amountMinor, amount.currency)}</span>;
}
