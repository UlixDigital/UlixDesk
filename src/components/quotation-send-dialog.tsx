"use client";

import { useActionState, useState } from "react";
import { sendQuotationAction, type QuotationFormState } from "@/app/quotations/actions";
import { quotationCopy } from "@/lib/quotation-copy";
import { ui } from "@/lib/ui";

const idle: QuotationFormState = { error: null, notice: null };

export function QuotationSendDialog({
  quotationId,
  draft,
  mailConfigured,
  defaultTo,
  defaultSubject,
  defaultBody,
}: {
  quotationId: string;
  draft: boolean;
  mailConfigured: boolean;
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(sendQuotationAction, idle);
  const unconfigured = !mailConfigured || state.unconfigured === true;
  return (
    <section>
      <button type="button" className={ui.primaryButton} onClick={() => setOpen(true)}>
        {quotationCopy.send}
      </button>
      {open ? (
        <div id="quotation-send-dialog" className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">{quotationCopy.sendTitle}</h2>
          {unconfigured ? (
            <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {quotationCopy.mailUnconfigured}
            </p>
          ) : null}
          {state.error && !state.unconfigured ? (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {state.error}
            </p>
          ) : null}
          <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={quotationId} />
            <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-send-to">
              {quotationCopy.sendTo}
              <input id="quotation-send-to" name="to" defaultValue={defaultTo} className={`${ui.input} mt-1.5`} />
            </label>
            <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-send-cc">
              {quotationCopy.sendCc}
              <input id="quotation-send-cc" name="cc" className={`${ui.input} mt-1.5`} />
            </label>
            <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-send-subject">
              {quotationCopy.sendSubject}
              <input id="quotation-send-subject" name="subject" defaultValue={defaultSubject} className={`${ui.input} mt-1.5`} />
            </label>
            <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-send-body">
              {quotationCopy.sendBody}
              <textarea id="quotation-send-body" name="body" defaultValue={defaultBody} rows={8} className={`${ui.input} mt-1.5`} />
            </label>
            <p className="text-xs text-slate-500">{quotationCopy.sendAttachment}</p>
            {draft ? (
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input name="confirmSend" type="checkbox" className="mt-1" />
                {quotationCopy.sendConfirmLabel}
              </label>
            ) : (
              <input type="hidden" name="confirmSend" value="on" />
            )}
            <button type="submit" className={ui.primaryButton} disabled={pending || unconfigured}>
              {pending ? quotationCopy.sending : quotationCopy.sendButton}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
