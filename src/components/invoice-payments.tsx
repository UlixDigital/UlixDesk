"use client";

import { useActionState } from "react";
import {
  correctPaymentAction,
  deletePaymentAction,
  recordPaymentAction,
  type InvoiceFormState,
} from "@/app/invoices/actions";
import { paymentMethodLabel, paymentMethods } from "@/lib/invoice-balance";
import { invoiceCopy } from "@/lib/invoice-copy";
import { formatMoneyNumber } from "@/lib/money";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

export function RecordPaymentForm({
  invoiceId,
  currency,
  today,
  dueLabel,
}: {
  invoiceId: string;
  currency: string;
  today: string;
  dueLabel: string;
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, idle);
  return (
    <section id="record-payment" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{invoiceCopy.recordPayment}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {invoiceCopy.recordPaymentHint} {invoiceCopy.amountDue}: {dueLabel}.
      </p>
      {state.error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <label className="block text-sm font-medium text-slate-800" htmlFor="payment-amount">
          {invoiceCopy.amount} ({currency})
          <input
            id="payment-amount"
            name="amount"
            inputMode="decimal"
            required
            className={`${ui.input} mt-1.5`}
            placeholder={formatMoneyNumber(0, currency)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="payment-date">
          {invoiceCopy.paymentDate}
          <input id="payment-date" name="paidOn" type="date" required defaultValue={today} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="payment-method">
          {invoiceCopy.paymentMethod}
          <select id="payment-method" name="method" required defaultValue="bank_transfer" className={`${ui.input} mt-1.5`}>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {paymentMethodLabel(method)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="payment-note">
          {invoiceCopy.paymentNote}
          <input id="payment-note" name="note" maxLength={500} className={`${ui.input} mt-1.5`} placeholder={invoiceCopy.paymentNoteHint} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className={ui.primaryButton} disabled={pending}>
            {pending ? invoiceCopy.paymentSaving : invoiceCopy.paymentSave}
          </button>
        </div>
      </form>
    </section>
  );
}

export function PaymentHistory({
  invoiceId,
  currency,
  payments,
}: {
  invoiceId: string;
  currency: string;
  payments: Array<{
    id: string;
    amountLabel: string;
    amountValue: string;
    paidOn: string;
    paidOnLabel: string;
    method: string | null;
    note: string | null;
    recordedBy: string;
  }>;
}) {
  return (
    <section id="invoice-payments" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{invoiceCopy.paymentHistory}</h2>
      {payments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{invoiceCopy.paymentHistoryEmpty}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {payments.map((payment) => (
            <article key={payment.id} className="rounded-lg border border-slate-200 p-3">
              <dl className="grid gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">{invoiceCopy.paymentDate}</dt>
                  <dd>{payment.paidOnLabel}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{invoiceCopy.amount}</dt>
                  <dd>{payment.amountLabel}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{invoiceCopy.paymentMethod}</dt>
                  <dd>{paymentMethodLabel(payment.method)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{invoiceCopy.paymentRecordedBy}</dt>
                  <dd>{payment.recordedBy}</dd>
                </div>
              </dl>
              {payment.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{payment.note}</p> : null}
              <div className="mt-3 flex flex-col gap-3">
                <CorrectPaymentForm
                  invoiceId={invoiceId}
                  paymentId={payment.id}
                  currency={currency}
                  amountValue={payment.amountValue}
                  paidOn={payment.paidOn}
                  method={payment.method ?? "bank_transfer"}
                  note={payment.note ?? ""}
                />
                <DeletePaymentForm invoiceId={invoiceId} paymentId={payment.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CorrectPaymentForm({
  invoiceId,
  paymentId,
  currency,
  amountValue,
  paidOn,
  method,
  note,
}: {
  invoiceId: string;
  paymentId: string;
  currency: string;
  amountValue: string;
  paidOn: string;
  method: string;
  note: string;
}) {
  const [state, action, pending] = useActionState(correctPaymentAction, idle);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium text-accent">{invoiceCopy.paymentCorrect}</summary>
      <p className="mt-2 text-sm text-slate-600">{invoiceCopy.paymentCorrectHint}</p>
      {state.error ? (
        <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <label className="block text-sm font-medium text-slate-800">
          {invoiceCopy.amount} ({currency})
          <input name="amount" required defaultValue={amountValue} inputMode="decimal" className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {invoiceCopy.paymentDate}
          <input name="paidOn" type="date" required defaultValue={paidOn} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {invoiceCopy.paymentMethod}
          <select name="method" required defaultValue={method} className={`${ui.input} mt-1.5`}>
            {paymentMethods.map((item) => (
              <option key={item} value={item}>
                {paymentMethodLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {invoiceCopy.paymentNote}
          <input name="note" maxLength={500} defaultValue={note} className={`${ui.input} mt-1.5`} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className={ui.secondaryButton} disabled={pending}>
            {pending ? invoiceCopy.paymentSaving : invoiceCopy.paymentSave}
          </button>
        </div>
      </form>
    </details>
  );
}

function DeletePaymentForm({ invoiceId, paymentId }: { invoiceId: string; paymentId: string }) {
  const [state, action, pending] = useActionState(deletePaymentAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-sm text-slate-600">{invoiceCopy.paymentDeleteHint}</p>
      {state.error ? (
        <p role="alert" className="text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={ui.dangerButton} disabled={pending}>
        {pending ? invoiceCopy.paymentDeleting : invoiceCopy.paymentDelete}
      </button>
    </form>
  );
}
