"use client";

import { useActionState } from "react";
import { revokeClientLinkAction, rotateClientLinkAction, type InvoiceFormState } from "@/app/invoices/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

export function InvoiceClientLink({
  invoiceId,
  url,
  unreadable,
  draft,
}: {
  invoiceId: string;
  url: string | null;
  unreadable: boolean;
  draft: boolean;
}) {
  const [rotateState, rotate, rotatePending] = useActionState(rotateClientLinkAction, idle);
  const [revokeState, revoke, revokePending] = useActionState(revokeClientLinkAction, idle);
  const error = rotateState.error ?? revokeState.error;
  const notice = rotateState.notice ?? revokeState.notice;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{invoiceCopy.clientLink}</h2>
      <p className="mt-1 text-sm text-slate-600">{invoiceCopy.clientLinkHint}</p>
      {draft && url ? <p className="mt-2 text-sm text-slate-600">{invoiceCopy.clientLinkDraft}</p> : null}
      {unreadable ? <p className="mt-2 text-sm text-amber-900">{invoiceCopy.linkUnreadable}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {notice}
        </p>
      ) : null}
      {url ? (
        <div className="mt-3">
          <CopyLinkButton url={url} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">{invoiceCopy.clientLinkNone}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={rotate}>
          <input type="hidden" name="id" value={invoiceId} />
          <button type="submit" className={ui.secondaryButton} disabled={rotatePending || revokePending}>
            {url || unreadable ? invoiceCopy.clientLinkRegenerate : invoiceCopy.clientLinkCreate}
          </button>
        </form>
        {url || unreadable ? (
          <form action={revoke}>
            <input type="hidden" name="id" value={invoiceId} />
            <button type="submit" className={ui.secondaryButton} disabled={rotatePending || revokePending}>
              {invoiceCopy.clientLinkRevoke}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
