"use client";

import { useActionState, useState } from "react";
import { deleteBudgetAction, saveBudgetAction } from "@/app/budgets/actions";
import { budgetCodes, budgetCopy } from "@/lib/budget-copy";
import type { BudgetFormValues } from "@/lib/budgets";
import { textInputClass, ui } from "@/lib/ui";

const emptyNotice = { error: null, notice: null };

export function BudgetForm({
  scope,
  projectId,
  clientId,
  currency,
  initial,
  hasBudget,
}: {
  scope: "project" | "client";
  projectId?: string;
  clientId?: string;
  currency: string;
  initial: BudgetFormValues;
  hasBudget: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveBudgetAction, {
    error: null,
    code: null,
    notice: null,
    values: initial,
  });
  const [removed, removeAction, removePending] = useActionState(deleteBudgetAction, emptyNotice);
  const serverKey = JSON.stringify(state.values);
  const [basis, setBasis] = useSyncedState(state.values.basis, serverKey);
  const [amount, setAmount] = useSyncedState(state.values.amount, serverKey);
  const [recurrence, setRecurrence] = useSyncedState(state.values.recurrence, serverKey);
  const [startsOn, setStartsOn] = useSyncedState(state.values.startsOn, serverKey);
  const [alertPercent, setAlertPercent] = useSyncedState(state.values.alertPercent, serverKey);
  const [billableOnly, setBillableOnly] = useSyncedBool(state.values.billableOnly, serverKey);
  const [hardStop, setHardStop] = useSyncedBool(state.values.hardStop, serverKey);
  const amountInvalid = state.code === budgetCodes.BUDGET_AMOUNT || state.code === budgetCodes.BUDGET_CURRENCY;
  const startInvalid = state.code === budgetCodes.BUDGET_START;
  const alertInvalid = state.code === budgetCodes.BUDGET_ALERT;
  const errorId = "budget-error";

  return (
    <div id="budget-settings" className="mt-4 space-y-4">
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
      {removed.notice ? (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {removed.notice}
        </p>
      ) : null}
      {removed.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {removed.error}
        </p>
      ) : null}
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="scope" value={scope} readOnly />
        {projectId ? <input type="hidden" name="projectId" value={projectId} readOnly /> : null}
        {clientId ? <input type="hidden" name="clientId" value={clientId} readOnly /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="budget-basis" className="text-sm font-medium text-slate-800">
              {budgetCopy.basisLabel}
            </label>
            <select
              id="budget-basis"
              name="basis"
              value={basis}
              onChange={(event) => setBasis(event.target.value)}
              className={`${ui.input} mt-1.5`}
            >
              <option value="hours">{budgetCopy.basisHours}</option>
              <option value="cost">{budgetCopy.basisCost}</option>
            </select>
          </div>
          <div>
            <label htmlFor="budget-amount" className="text-sm font-medium text-slate-800">
              {budgetCopy.amountLabel}
            </label>
            <input
              id="budget-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? errorId : "budget-amount-hint"}
              className={`${textInputClass(amountInvalid)} mt-1.5`}
            />
            <p id="budget-amount-hint" className="mt-1.5 text-xs text-slate-500">
              {basis === "cost" ? currency : budgetCopy.hoursHint}
            </p>
          </div>
          <div>
            <label htmlFor="budget-recurrence" className="text-sm font-medium text-slate-800">
              {budgetCopy.recurrenceLabel}
            </label>
            <select
              id="budget-recurrence"
              name="recurrence"
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value)}
              className={`${ui.input} mt-1.5`}
            >
              <option value="total">{budgetCopy.recurrenceTotal}</option>
              <option value="weekly">{budgetCopy.recurrenceWeekly}</option>
              <option value="monthly">{budgetCopy.recurrenceMonthly}</option>
            </select>
          </div>
          <div>
            <label htmlFor="budget-starts-on" className="text-sm font-medium text-slate-800">
              {budgetCopy.startsOnLabel}
            </label>
            <input
              id="budget-starts-on"
              name="startsOn"
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              aria-invalid={startInvalid || undefined}
              aria-describedby={startInvalid ? errorId : "budget-start-hint"}
              className={`${textInputClass(startInvalid)} mt-1.5`}
            />
            <p id="budget-start-hint" className="mt-1.5 text-xs text-slate-500">
              {budgetCopy.startsOnHint}
            </p>
          </div>
          <div>
            <label htmlFor="budget-alert" className="text-sm font-medium text-slate-800">
              {budgetCopy.alertLabel}
            </label>
            <input
              id="budget-alert"
              name="alertPercent"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={alertPercent}
              onChange={(event) => setAlertPercent(event.target.value)}
              aria-invalid={alertInvalid || undefined}
              aria-describedby={alertInvalid ? errorId : "budget-alert-hint"}
              className={`${textInputClass(alertInvalid)} mt-1.5`}
            />
            <p id="budget-alert-hint" className="mt-1.5 text-xs text-slate-500">
              {budgetCopy.alertHint}
            </p>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-800">
          <input
            id="budget-billable-only"
            name="billableOnly"
            type="checkbox"
            value="on"
            checked={billableOnly}
            onChange={(event) => setBillableOnly(event.target.checked)}
            className="mt-0.5"
          />
          {budgetCopy.billableOnlyLabel}
        </label>
        {scope === "project" ? (
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              id="budget-hard-stop"
              name="hardStop"
              type="checkbox"
              value="on"
              checked={hardStop}
              onChange={(event) => setHardStop(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {budgetCopy.hardStopLabel}
              <span className="mt-0.5 block text-xs text-slate-500">{budgetCopy.hardStopHint}</span>
            </span>
          </label>
        ) : null}
        <button type="submit" className={ui.primaryButton} disabled={pending}>
          {pending ? budgetCopy.saving : budgetCopy.save}
        </button>
      </form>
      {hasBudget ? (
        <form action={removeAction}>
          <input type="hidden" name="scope" value={scope} readOnly />
          {projectId ? <input type="hidden" name="projectId" value={projectId} readOnly /> : null}
          {clientId ? <input type="hidden" name="clientId" value={clientId} readOnly /> : null}
          <button type="submit" className={ui.secondaryButton} disabled={removePending}>
            {budgetCopy.remove}
          </button>
        </form>
      ) : null}
    </div>
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

function useSyncedBool(value: boolean, serverKey: string) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(serverKey);
  if (seen !== serverKey) {
    setSeen(serverKey);
    setLocal(value);
  }
  return [local, setLocal] as const;
}
