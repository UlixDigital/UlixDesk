"use client";

import { useActionState, useState } from "react";
import { saveDraftAction, type InvoiceFormState } from "@/app/invoices/actions";
import { invoiceCopy } from "@/lib/invoice-copy";
import { lineAmountFromMs, parseQuantityInput } from "@/lib/invoice-money";
import { formatMoney, parseRateInput } from "@/lib/money";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

type LineState = {
  key: string;
  id: string;
  kind: "time" | "custom";
  title: string;
  detail: string;
  rangeStart: string;
  rangeEnd: string;
  quantity: string;
  unitPrice: string;
};

export function InvoiceDraftForm({
  invoiceId,
  currency,
  issueDate,
  dueDate,
  poNumber,
  periodStart,
  periodEnd,
  grouping,
  notes,
  bankDetails,
  discountKind,
  discountValue,
  taxEnabled,
  taxLabel,
  taxRate,
  lines,
}: {
  invoiceId: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  poNumber: string;
  periodStart: string;
  periodEnd: string;
  grouping: string;
  notes: string;
  bankDetails: string;
  discountKind: string;
  discountValue: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: string;
  lines: LineState[];
}) {
  const [state, action, pending] = useActionState(saveDraftAction, idle);
  const [rows, setRows] = useState(lines);
  return (
    <form action={action} className="space-y-6" id="invoice-draft">
      <input type="hidden" name="id" value={invoiceId} />
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {state.notice}
        </p>
      ) : null}
      {state.confirmDiffs && state.confirmDiffs.length > 0 ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">{invoiceCopy.issueConfirm}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.confirmDiffs.map((diff) => (
              <li key={diff}>{diff}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-issue-date">
          {invoiceCopy.issueDate}
          <input id="invoice-issue-date" name="issueDate" type="date" defaultValue={issueDate} className={`${ui.input} mt-1.5`} required />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-due-date">
          {invoiceCopy.dueDate}
          <input id="invoice-due-date" name="dueDate" type="date" defaultValue={dueDate} className={`${ui.input} mt-1.5`} required />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-po">
          {invoiceCopy.po}
          <input id="invoice-po" name="poNumber" defaultValue={poNumber} className={`${ui.input} mt-1.5`} />
        </label>
      </div>
      <p className="text-xs text-slate-500">{invoiceCopy.lineHint}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200" id="invoice-lines">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">{invoiceCopy.description}</th>
              <th className="px-3 py-2 font-medium">{invoiceCopy.hours}</th>
              <th className="px-3 py-2 font-medium">{invoiceCopy.unitPrice}</th>
              <th className="px-3 py-2 font-medium">{invoiceCopy.amount}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className="border-t border-slate-200 align-top" data-line-kind={row.kind}>
                <td className="px-3 py-2">
                  <input type="hidden" name="lineId" value={row.id} />
                  <input type="hidden" name="lineKind" value={row.kind} />
                  <p className="mb-1 text-xs font-medium text-slate-500">
                    {row.kind === "time" ? invoiceCopy.timeLine : invoiceCopy.manualLine}
                  </p>
                  <input
                    aria-label={`${invoiceCopy.description} ${index + 1}`}
                    name="lineTitle"
                    value={row.title}
                    onChange={(event) => update(setRows, index, { title: event.target.value })}
                    className={ui.input}
                  />
                  {row.kind === "time" ? (
                    <input
                      aria-label={`Detail ${index + 1}`}
                      name="lineDetail"
                      value={row.detail}
                      onChange={(event) => update(setRows, index, { detail: event.target.value })}
                      className={`${ui.input} mt-2`}
                    />
                  ) : (
                    <input type="hidden" name="lineDetail" value={row.detail} />
                  )}
                  {row.kind === "custom" ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-600">
                        {invoiceCopy.rangeStart}
                        <input
                          aria-label={`${invoiceCopy.rangeStart} ${index + 1}`}
                          name="lineRangeStart"
                          type="date"
                          value={row.rangeStart}
                          onChange={(event) => update(setRows, index, { rangeStart: event.target.value })}
                          className={`${ui.input} mt-1`}
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        {invoiceCopy.rangeEnd}
                        <input
                          aria-label={`${invoiceCopy.rangeEnd} ${index + 1}`}
                          name="lineRangeEnd"
                          type="date"
                          value={row.rangeEnd}
                          onChange={(event) => update(setRows, index, { rangeEnd: event.target.value })}
                          className={`${ui.input} mt-1`}
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <input type="hidden" name="lineRangeStart" value="" />
                      <input type="hidden" name="lineRangeEnd" value="" />
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`${invoiceCopy.hours} ${index + 1}`}
                    name="lineQuantity"
                    value={row.quantity}
                    onChange={(event) => update(setRows, index, { quantity: event.target.value })}
                    className={`${ui.input} w-28`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`${invoiceCopy.unitPrice} ${index + 1}`}
                    name="lineUnitPrice"
                    value={row.unitPrice}
                    onChange={(event) => update(setRows, index, { unitPrice: event.target.value })}
                    className={`${ui.input} w-28`}
                  />
                </td>
                <td className="px-3 py-2 pt-4 text-slate-700">{previewAmount(row, currency)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className={ui.secondaryButton}
                      aria-label={`${invoiceCopy.moveUp} ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => setRows((current) => move(current, index, -1))}
                    >
                      {invoiceCopy.moveUp}
                    </button>
                    <button
                      type="button"
                      className={ui.secondaryButton}
                      aria-label={`${invoiceCopy.moveDown} ${index + 1}`}
                      disabled={index === rows.length - 1}
                      onClick={() => setRows((current) => move(current, index, 1))}
                    >
                      {invoiceCopy.moveDown}
                    </button>
                    <button
                      type="button"
                      className={ui.secondaryButton}
                      onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      {invoiceCopy.removeLine}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={ui.secondaryButton}
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: `new-${current.length}-${Date.now()}`,
              id: "",
              kind: "custom",
              title: invoiceCopy.customTitle,
              detail: "",
              rangeStart: "",
              rangeEnd: "",
              quantity: "1:00:00",
              unitPrice: "0",
            },
          ])
        }
      >
        {invoiceCopy.addLine}
      </button>
      <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
        <legend className="px-1 text-sm font-medium text-slate-800">{invoiceCopy.trackedTime}</legend>
        <p className="text-xs text-slate-500 sm:col-span-4">{invoiceCopy.trackedTimeHint}</p>
        <label className="block text-sm font-medium text-slate-800" htmlFor="draft-period-start">
          Start
          <input
            id="draft-period-start"
            name="periodStart"
            type="date"
            defaultValue={periodStart}
            className={`${ui.input} mt-1.5`}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="draft-period-end">
          End
          <input id="draft-period-end" name="periodEnd" type="date" defaultValue={periodEnd} className={`${ui.input} mt-1.5`} required />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="draft-grouping">
          {invoiceCopy.grouping}
          <select id="draft-grouping" name="grouping" defaultValue={grouping} className={`${ui.input} mt-1.5`}>
            <option value="period">{invoiceCopy.groupingPeriod}</option>
            <option value="project">{invoiceCopy.groupingProject}</option>
            <option value="member">{invoiceCopy.groupingMember}</option>
            <option value="day">{invoiceCopy.groupingDay}</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className={ui.secondaryButton}
            disabled={pending}
            onClick={(event) => setIntent(event.currentTarget.form, "refresh")}
          >
            {invoiceCopy.refresh}
          </button>
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-discount-kind">
          {invoiceCopy.discount}
          <select id="invoice-discount-kind" name="discountKind" defaultValue={discountKind} className={`${ui.input} mt-1.5`}>
            <option value="none">{invoiceCopy.discountNone}</option>
            <option value="percent">{invoiceCopy.discountPercent}</option>
            <option value="amount">{invoiceCopy.discountAmount}</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-discount-value">
          Value
          <input id="invoice-discount-value" name="discountValue" defaultValue={discountValue} className={`${ui.input} mt-1.5`} />
        </label>
      </div>
      <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-800" htmlFor="invoice-tax-enabled">
          <input id="invoice-tax-enabled" name="taxEnabled" type="checkbox" defaultChecked={taxEnabled} />
          {invoiceCopy.applyTax}
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-draft-tax-label">
          {invoiceCopy.taxLabel}
          <input id="invoice-draft-tax-label" name="taxLabel" defaultValue={taxLabel} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-draft-tax-rate">
          {invoiceCopy.taxRate}
          <input id="invoice-draft-tax-rate" name="taxRate" defaultValue={taxRate} className={`${ui.input} mt-1.5`} />
        </label>
      </fieldset>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-notes">
        {invoiceCopy.notes}
        <textarea id="invoice-notes" name="notes" defaultValue={notes} rows={4} className={`${ui.input} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-bank">
        {invoiceCopy.bank}
        <textarea id="invoice-bank" name="bankDetails" defaultValue={bankDetails} rows={6} className={`${ui.input} mt-1.5`} />
      </label>
      <input type="hidden" name="intent" value="save" />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className={ui.primaryButton}
          disabled={pending}
          onClick={(event) => setIntent(event.currentTarget.form, "save")}
        >
          {pending ? invoiceCopy.saving : invoiceCopy.save}
        </button>
        <button
          type="submit"
          className={ui.secondaryButton}
          disabled={pending}
          onClick={(event) => setIntent(event.currentTarget.form, "issue")}
        >
          {invoiceCopy.issue}
        </button>
        {state.confirmDiffs && state.confirmDiffs.length > 0 ? (
          <button
            type="submit"
            className={ui.primaryButton}
            disabled={pending}
            onClick={(event) => setIntent(event.currentTarget.form, "issue-confirm")}
          >
            {invoiceCopy.issueUpdated}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function setIntent(form: HTMLFormElement | null, intent: string) {
  const field = form?.elements.namedItem("intent");
  if (field instanceof HTMLInputElement) field.value = intent;
}

function update(
  setRows: (value: (current: LineState[]) => LineState[]) => void,
  index: number,
  patch: Partial<LineState>,
) {
  setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function move(rows: LineState[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= rows.length) return rows;
  const copy = [...rows];
  const current = copy[index];
  const swap = copy[next];
  if (!current || !swap) return rows;
  copy[index] = swap;
  copy[next] = current;
  return copy;
}

function previewAmount(row: LineState, currency: string) {
  const quantity = parseQuantityInput(row.quantity);
  const price = parseRateInput(row.unitPrice.trim() || "0", currency);
  if (!quantity.ok || !price.ok) return "—";
  try {
    return formatMoney(lineAmountFromMs(price.amountMinor, quantity.ms), currency);
  } catch {
    return "—";
  }
}
