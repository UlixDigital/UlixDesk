"use client";

import { useActionState } from "react";
import { saveWorkspaceCurrencyAction, type CurrencyFormState } from "@/app/rates/actions";
import { CURRENCIES, currencyOptionLabel } from "@/lib/currencies";
import { cn } from "@/lib/cn";
import { rateCopy } from "@/lib/rate-copy";
import { ui } from "@/lib/ui";

export function WorkspaceCurrencyForm({ currency }: { currency: string }) {
  const [state, formAction, pending] = useActionState(saveWorkspaceCurrencyAction, {
    error: null,
    code: null,
    notice: null,
    currency,
  } satisfies CurrencyFormState);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{rateCopy.workspaceTitle}</h2>
      <p className="mt-1 text-sm text-slate-600">{rateCopy.workspaceBody}</p>
      <form action={formAction} className="mt-4 space-y-4">
        {state.error ? (
          <p
            role="alert"
            data-error-code={state.code ?? undefined}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {state.error}
          </p>
        ) : null}
        {state.notice ? (
          <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            {state.notice}
          </p>
        ) : null}
        <div>
          <label htmlFor="workspace-currency" className="text-sm font-medium text-slate-800">
            {rateCopy.workspaceLabel}
          </label>
          <select
            id="workspace-currency"
            name="currency"
            defaultValue={state.currency}
            className={cn(ui.input, "mt-1.5")}
          >
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {currencyOptionLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={ui.primaryButton} disabled={pending}>
          {pending ? rateCopy.savingRate : rateCopy.workspaceSave}
        </button>
      </form>
    </section>
  );
}
