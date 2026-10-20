"use client";

import { useActionState } from "react";
import { reopenInvoiceAction, voidInvoiceAction, type InvoiceFormState } from "@/app/invoices/actions";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

export function InvoiceStatusActions({
  invoiceId,
  status,
  zeroPaid = false,
}: {
  invoiceId: string;
  status: string;
  /** Issued at a zero total, with no payment recorded. */
  zeroPaid?: boolean;
}) {
  const [voidState, voidAction, voidPending] = useActionState(voidInvoiceAction, idle);
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenInvoiceAction, idle);
  const error = voidState.error ?? reopenState.error;
  const canVoid = status === "open" || zeroPaid;
  const canReopen = status === "open" || status === "void" || zeroPaid;
  if (!canVoid && !canReopen) return null;
  return (
    <section id="invoice-status-actions" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{invoiceCopy.status}</h2>
      {canVoid ? <p className="mt-1 text-sm text-slate-600">{invoiceCopy.voidRules}</p> : null}
      {canReopen ? <p className="mt-1 text-sm text-slate-600">{invoiceCopy.reopenRules}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">
        {canVoid ? (
          <form action={voidAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="id" value={invoiceId} />
            <label className="block flex-1 text-sm font-medium text-slate-800" htmlFor="invoice-void-reason">
              {invoiceCopy.reason}
              <input id="invoice-void-reason" name="reason" className={`${ui.input} mt-1.5`} required />
            </label>
            <button type="submit" className={ui.dangerButton} disabled={voidPending || reopenPending}>
              {voidPending ? invoiceCopy.voiding : invoiceCopy.void}
            </button>
          </form>
        ) : null}
        {canReopen ? (
          <form action={reopenAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="id" value={invoiceId} />
            <label className="block flex-1 text-sm font-medium text-slate-800" htmlFor="invoice-reopen-reason">
              {invoiceCopy.reason}
              <input id="invoice-reopen-reason" name="reason" className={`${ui.input} mt-1.5`} required />
            </label>
            <button type="submit" className={ui.secondaryButton} disabled={voidPending || reopenPending}>
              {reopenPending ? invoiceCopy.reopening : invoiceCopy.reopen}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
