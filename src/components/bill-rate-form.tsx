"use client";

import { useActionState, useState } from "react";
import type { RateFormState } from "@/app/rates/actions";
import { cn } from "@/lib/cn";
import { moneyPlaceholder } from "@/lib/money";
import { effectiveFromHint, rateCodes, rateCopy } from "@/lib/rate-copy";
import { ui } from "@/lib/ui";

type SaveAction = (previous: RateFormState, formData: FormData) => Promise<RateFormState>;

export function BillRateForm({
  action,
  today,
  currency,
  timeZone,
  clientId,
  projectId,
  members,
}: {
  action: SaveAction;
  today: string;
  currency: string;
  timeZone: string;
  clientId?: string;
  projectId?: string;
  members?: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    code: null,
    notice: null,
    values: { amount: "", effectiveFrom: today, userId: "" },
  });
  const serverKey = JSON.stringify(state.values);
  const [amount, setAmount] = useSyncedState(state.values.amount, serverKey);
  const [effectiveFrom, setEffectiveFrom] = useSyncedState(state.values.effectiveFrom, serverKey);
  const [userId, setUserId] = useSyncedState(state.values.userId, serverKey);
  const amountId = projectId ? "project-rate-amount" : members ? "member-rate-amount" : "client-rate-amount";
  const dateId = projectId ? "project-rate-date" : members ? "member-rate-date" : "client-rate-date";
  const memberId = "member-rate-user";
  const errorId = `${amountId}-error`;
  const amountInvalid =
    state.code === rateCodes.RATE_INVALID || state.code === rateCodes.RATE_TOO_PRECISE;
  const dateInvalid = state.code === rateCodes.RATE_DATE_INVALID;
  const memberInvalid = state.code === rateCodes.RATE_MEMBER_REQUIRED;

  return (
    <form action={formAction} className="mt-4 space-y-4" noValidate>
      {clientId ? <input type="hidden" name="clientId" value={clientId} readOnly /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} readOnly /> : null}
      {state.error ? (
        <p
          id={errorId}
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
      {members ? (
        <div>
          <label htmlFor={memberId} className="text-sm font-medium text-slate-800">
            {rateCopy.memberLabel}
          </label>
          <select
            id={memberId}
            name="userId"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            aria-invalid={memberInvalid || undefined}
            aria-describedby={memberInvalid ? errorId : undefined}
            className={cn(ui.input, "mt-1.5", memberInvalid && ui.inputError)}
          >
            <option value="">{rateCopy.memberPlaceholder}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={amountId} className="text-sm font-medium text-slate-800">
            {rateCopy.amountLabel}
          </label>
          <input
            id={amountId}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            maxLength={16}
            placeholder={moneyPlaceholder(currency)}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={amountInvalid || undefined}
            aria-describedby={
              amountInvalid ? `${amountId}-currency ${errorId}` : `${amountId}-currency`
            }
            className={cn(ui.input, "mt-1.5", amountInvalid && ui.inputError)}
          />
          <p id={`${amountId}-currency`} className="mt-1.5 text-xs text-slate-500">
            {currency}
          </p>
        </div>
        <div>
          <label htmlFor={dateId} className="text-sm font-medium text-slate-800">
            {rateCopy.effectiveLabel}
          </label>
          <input
            id={dateId}
            name="effectiveFrom"
            type="date"
            required
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            aria-invalid={dateInvalid || undefined}
            aria-describedby={dateInvalid ? `${dateId}-hint ${errorId}` : `${dateId}-hint`}
            className={cn(ui.input, "mt-1.5", dateInvalid && ui.inputError)}
          />
          <p id={`${dateId}-hint`} className="mt-1.5 text-xs text-slate-500">
            {effectiveFromHint(timeZone)}
          </p>
        </div>
      </div>
      <button type="submit" className={ui.primaryButton} disabled={pending}>
        {pending ? rateCopy.savingRate : rateCopy.saveRate}
      </button>
    </form>
  );
}

function useSyncedState(value: string, serverKey: string) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(serverKey);
  if (seen !== serverKey) {
    setSeen(serverKey);
    setLocal(value);
  }
  return [local, setLocal] as const;
}
