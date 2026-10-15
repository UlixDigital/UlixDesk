"use client";

import { useActionState, useState } from "react";
import { sendInvoiceAction, type SendInvoiceState } from "@/app/invoices/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

const idle: SendInvoiceState = { error: null, notice: null };

export function InvoiceSendDialog({
  invoiceId,
  draft,
  mailConfigured,
  clientUrl,
  defaultTo,
  defaultCc,
  defaultSubject,
  defaultBody,
}: {
  invoiceId: string;
  draft: boolean;
  mailConfigured: boolean;
  clientUrl: string | null;
  defaultTo: string;
  defaultCc: string;
  defaultSubject: string;
  defaultBody: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(sendInvoiceAction, idle);
  const unconfigured = !mailConfigured || state.unconfigured === true;
  return (
    <section>
      <button type="button" className={ui.primaryButton} onClick={() => setOpen(true)}>
        {invoiceCopy.send}
      </button>
      {open ? (
        <div
          id="invoice-send-dialog"
          role="dialog"
          aria-labelledby="invoice-send-title"
          className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="invoice-send-title" className="text-sm font-semibold text-ink">
              {invoiceCopy.sendTitle}
            </h2>
            <button type="button" className={ui.secondaryButton} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {unconfigured ? (
            <p
              id="invoice-mail-unconfigured"
              role="status"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              {invoiceCopy.mailUnconfigured}
            </p>
          ) : null}
          {state.error && !unconfigured ? (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {state.error}
            </p>
          ) : null}
          {state.confirmDiffs && state.confirmDiffs.length > 0 ? (
            <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">{invoiceCopy.issueConfirm}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.confirmDiffs.map((diff) => (
                  <li key={diff}>{diff}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <form action={action} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={invoiceId} />
            <input type="hidden" name="confirmTime" value={state.confirmDiffs?.length ? "yes" : ""} />
            <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-send-to">
              {invoiceCopy.sendTo}
              <textarea
                id="invoice-send-to"
                name="to"
                defaultValue={defaultTo}
                rows={2}
                className={`${ui.input} mt-1.5`}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-send-cc">
              {invoiceCopy.sendCc}
              <textarea id="invoice-send-cc" name="cc" defaultValue={defaultCc} rows={2} className={`${ui.input} mt-1.5`} />
            </label>
            <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-send-subject">
              {invoiceCopy.sendSubject}
              <input
                id="invoice-send-subject"
                name="subject"
                defaultValue={defaultSubject}
                className={`${ui.input} mt-1.5`}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-send-body">
              {invoiceCopy.sendBody}
              <textarea
                id="invoice-send-body"
                name="body"
                defaultValue={defaultBody}
                rows={8}
                className={`${ui.input} mt-1.5`}
                required
              />
            </label>
            <p className="text-sm text-slate-600">{invoiceCopy.sendAttachment}</p>
            {clientUrl ? <CopyLinkButton id="invoice-send-link" url={clientUrl} /> : null}
            {draft ? (
              <label className="flex items-start gap-2 text-sm text-slate-800" htmlFor="invoice-send-confirm">
                <input id="invoice-send-confirm" name="confirmIssue" type="checkbox" value="yes" className="mt-1" />
                {invoiceCopy.sendConfirmLabel}
              </label>
            ) : (
              <input type="hidden" name="confirmIssue" value="yes" />
            )}
            <button type="submit" className={ui.primaryButton} disabled={pending || unconfigured}>
              {pending ? invoiceCopy.sending : state.confirmDiffs?.length ? invoiceCopy.sendUpdated : invoiceCopy.sendButton}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
