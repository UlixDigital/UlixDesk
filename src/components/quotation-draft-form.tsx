"use client";

import { useActionState, useMemo, useState } from "react";
import { saveQuotationAction, type QuotationFormState } from "@/app/quotations/actions";
import { QUOTATION_VALID_MONTHS, quotationCopy } from "@/lib/quotation-copy";
import { addCalendarMonths } from "@/lib/time-zone";
import { lineAmountFromCount, lineAmountFromMs, parseItemQuantity, parseQuantityInput } from "@/lib/invoice-money";
import { formatMoney, parseRateInput } from "@/lib/money";
import { invoiceTotals } from "@/lib/invoice-money";
import { parsePercentBps } from "@/lib/invoice-money";
import { ui } from "@/lib/ui";

const idle: QuotationFormState = { error: null, notice: null };

type LineState = {
  key: string;
  quantityKind: "hours" | "item";
  title: string;
  detail: string;
  rangeStart: string;
  rangeEnd: string;
  quantity: string;
  unitPrice: string;
};

export function QuotationDraftForm({
  quotationId,
  currency,
  issueDate,
  validUntil,
  notes,
  terms,
  taxEnabled,
  taxLabel,
  taxRate,
  lines,
}: {
  quotationId: string;
  currency: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  terms: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: string;
  lines: LineState[];
}) {
  const [state, action, pending] = useActionState(saveQuotationAction, idle);
  const [rows, setRows] = useState(lines);
  const [taxOn, setTaxOn] = useState(taxEnabled);
  const [rate, setRate] = useState(taxRate);
  const [issue, setIssue] = useState(issueDate);
  const [valid, setValid] = useState(validUntil);
  const [validTouched, setValidTouched] = useState(false);
  const preview = useMemo(() => previewTotals(rows, currency, taxOn, rate), [rows, currency, taxOn, rate]);

  return (
    <form action={action} className="space-y-6" id="quotation-draft">
      <input type="hidden" name="id" value={quotationId} />
      <input type="hidden" name="intent" value="save" />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-issue-date">
          {quotationCopy.issueDate}
          <input
            id="quotation-issue-date"
            name="issueDate"
            type="date"
            value={issue}
            onChange={(event) => {
              const next = event.target.value;
              setIssue(next);
              if (!validTouched && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
                setValid(addCalendarMonths(next, QUOTATION_VALID_MONTHS));
              }
            }}
            className={`${ui.input} mt-1.5`}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-valid-until">
          {quotationCopy.validUntil}
          <input
            id="quotation-valid-until"
            name="validUntil"
            type="date"
            value={valid}
            onChange={(event) => {
              setValidTouched(true);
              setValid(event.target.value);
            }}
            className={`${ui.input} mt-1.5`}
            required
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">{quotationCopy.validUntilHint}</span>
        </label>
      </div>
      <p className="text-xs text-slate-500">{quotationCopy.lineHint}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200" id="quotation-lines">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">{quotationCopy.description}</th>
              <th className="px-3 py-2 font-medium">{quotationCopy.qty}</th>
              <th className="px-3 py-2 font-medium">{quotationCopy.unitPrice}</th>
              <th className="px-3 py-2 font-medium">{quotationCopy.amount}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2">
                  <input type="hidden" name="lineQuantityKind" value={row.quantityKind} />
                  <label className="mb-2 block text-xs font-medium text-slate-600">
                    {quotationCopy.lineType}
                    <select
                      aria-label={`${quotationCopy.lineType} ${index + 1}`}
                      value={row.quantityKind}
                      onChange={(event) =>
                        update(setRows, index, { quantityKind: event.target.value === "hours" ? "hours" : "item" })
                      }
                      className={`${ui.input} mt-1`}
                    >
                      <option value="item">{quotationCopy.lineTypeItem}</option>
                      <option value="hours">{quotationCopy.lineTypeHours}</option>
                    </select>
                  </label>
                  <input
                    aria-label={`${quotationCopy.description} ${index + 1}`}
                    name="lineTitle"
                    value={row.title}
                    onChange={(event) => update(setRows, index, { title: event.target.value })}
                    className={ui.input}
                  />
                  <label className="mt-2 block text-xs font-medium text-slate-600">
                    {quotationCopy.lineDescription}
                    <textarea
                      aria-label={`${quotationCopy.lineDescription} ${index + 1}`}
                      name="lineDetail"
                      value={row.detail}
                      rows={3}
                      onChange={(event) => update(setRows, index, { detail: event.target.value })}
                      placeholder={quotationCopy.lineDescriptionHint}
                      className={`${ui.input} mt-1`}
                    />
                  </label>
                  <details
                    className="mt-2"
                    ref={(node) => {
                      if (!node || node.dataset.seeded === "1") return;
                      node.dataset.seeded = "1";
                      if (row.rangeStart !== "" || row.rangeEnd !== "") node.open = true;
                    }}
                  >
                    <summary className="cursor-pointer text-xs font-medium text-slate-600">{quotationCopy.dateRange}</summary>
                    <p className="mt-1 text-xs text-slate-500">{quotationCopy.dateRangeHint}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-600">
                        {quotationCopy.rangeStart}
                        <input
                          aria-label={`${quotationCopy.rangeStart} ${index + 1}`}
                          name="lineRangeStart"
                          type="date"
                          value={row.rangeStart}
                          onChange={(event) => update(setRows, index, { rangeStart: event.target.value })}
                          className={`${ui.input} mt-1`}
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        {quotationCopy.rangeEnd}
                        <input
                          aria-label={`${quotationCopy.rangeEnd} ${index + 1}`}
                          name="lineRangeEnd"
                          type="date"
                          value={row.rangeEnd}
                          onChange={(event) => update(setRows, index, { rangeEnd: event.target.value })}
                          className={`${ui.input} mt-1`}
                        />
                      </label>
                    </div>
                  </details>
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`${row.quantityKind === "item" ? quotationCopy.qty : quotationCopy.hours} ${index + 1}`}
                    name="lineQuantity"
                    value={row.quantity}
                    onChange={(event) => update(setRows, index, { quantity: event.target.value })}
                    className={`${ui.input} w-28`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`${quotationCopy.unitPrice} ${index + 1}`}
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
                      aria-label={`${quotationCopy.moveUp} ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => setRows((current) => move(current, index, -1))}
                    >
                      {quotationCopy.moveUp}
                    </button>
                    <button
                      type="button"
                      className={ui.secondaryButton}
                      aria-label={`${quotationCopy.moveDown} ${index + 1}`}
                      disabled={index === rows.length - 1}
                      onClick={() => setRows((current) => move(current, index, 1))}
                    >
                      {quotationCopy.moveDown}
                    </button>
                    <button
                      type="button"
                      className={ui.secondaryButton}
                      onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      {quotationCopy.removeLine}
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
              quantityKind: "item",
              title: "",
              detail: "",
              rangeStart: "",
              rangeEnd: "",
              quantity: "1",
              unitPrice: "0",
            },
          ])
        }
      >
        {quotationCopy.addLine}
      </button>
      <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-800" htmlFor="quotation-tax-enabled">
          <input
            id="quotation-tax-enabled"
            name="taxEnabled"
            type="checkbox"
            checked={taxOn}
            onChange={(event) => setTaxOn(event.target.checked)}
          />
          {quotationCopy.applyTax}
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-tax-label">
          {quotationCopy.taxLabel}
          <input id="quotation-tax-label" name="taxLabel" defaultValue={taxLabel} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-tax-rate">
          {quotationCopy.taxRate}
          <input
            id="quotation-tax-rate"
            name="taxRate"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            className={`${ui.input} mt-1.5`}
          />
        </label>
      </fieldset>
      <dl id="quotation-totals" className="grid gap-2 text-sm sm:ml-auto sm:max-w-xs">
        <div className="flex justify-between gap-6">
          <dt>{quotationCopy.subtotal}</dt>
          <dd>{preview.subtotal}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>{quotationCopy.tax}</dt>
          <dd>{preview.tax}</dd>
        </div>
        <div className="flex justify-between gap-6 font-semibold text-ink">
          <dt>{quotationCopy.total}</dt>
          <dd>{preview.total}</dd>
        </div>
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-notes">
          {quotationCopy.notes}
          <textarea id="quotation-notes" name="notes" defaultValue={notes} rows={4} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-terms">
          {quotationCopy.terms}
          <textarea id="quotation-terms" name="terms" defaultValue={terms} rows={4} className={`${ui.input} mt-1.5`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={ui.primaryButton} disabled={pending} onClick={(event) => setIntent(event.currentTarget.form, "save")}>
          {pending ? quotationCopy.saving : quotationCopy.save}
        </button>
        <button
          type="submit"
          className={ui.secondaryButton}
          disabled={pending}
          onClick={(event) => setIntent(event.currentTarget.form, "send")}
        >
          {quotationCopy.markSent}
        </button>
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

function lineMinor(row: LineState, currency: string) {
  const priceRaw = row.unitPrice.trim();
  if (priceRaw.startsWith("-") || priceRaw.startsWith("−")) return null;
  const price = parseRateInput(priceRaw || "0", currency);
  if (!price.ok) return null;
  try {
    if (row.quantityKind === "item") {
      const quantity = parseItemQuantity(row.quantity);
      if (!quantity.ok) return null;
      return lineAmountFromCount(price.amountMinor, quantity.scaled);
    }
    const quantity = parseQuantityInput(row.quantity);
    if (!quantity.ok) return null;
    return lineAmountFromMs(price.amountMinor, quantity.ms);
  } catch {
    return null;
  }
}

function previewAmount(row: LineState, currency: string) {
  const amount = lineMinor(row, currency);
  if (amount === null) return "—";
  return formatMoney(amount, currency);
}

function previewTotals(rows: LineState[], currency: string, taxOn: boolean, rate: string) {
  const amounts = rows.map((row) => lineMinor(row, currency)).filter((amount): amount is number => amount !== null);
  const parsed = parsePercentBps(rate.trim() || "0");
  try {
    const totals = invoiceTotals({
      lineAmounts: amounts,
      discountKind: "none",
      discountAmountMinor: 0,
      discountBps: 0,
      taxEnabled: taxOn,
      taxRateBps: parsed.ok ? parsed.bps : 0,
    });
    return {
      subtotal: formatMoney(totals.subtotalMinor, currency),
      tax: formatMoney(totals.taxMinor, currency),
      total: formatMoney(totals.totalMinor, currency),
    };
  } catch {
    return { subtotal: "—", tax: "—", total: "—" };
  }
}
