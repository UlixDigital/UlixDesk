"use client";

import { useActionState } from "react";
import { revokeQuotationLinkAction, rotateQuotationLinkAction, type QuotationFormState } from "@/app/quotations/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { quotationCopy } from "@/lib/quotation-copy";
import { ui } from "@/lib/ui";

const idle: QuotationFormState = { error: null, notice: null };

export function QuotationClientLink({
  quotationId,
  url,
  keyMessage,
  draft,
}: {
  quotationId: string;
  url: string | null;
  keyMessage: string | null;
  draft: boolean;
}) {
  const [rotateState, rotate, rotatePending] = useActionState(rotateQuotationLinkAction, idle);
  const [revokeState, revoke, revokePending] = useActionState(revokeQuotationLinkAction, idle);
  const error = rotateState.error ?? revokeState.error;
  const notice = rotateState.notice ?? revokeState.notice;
  return (
    <section id="quotation-client-link" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{quotationCopy.clientLink}</h2>
      <p className="mt-1 text-sm text-slate-600">{quotationCopy.clientLinkHint}</p>
      {draft && url ? <p className="mt-2 text-sm text-slate-600">{quotationCopy.clientLinkDraft}</p> : null}
      {keyMessage ? <p className="mt-2 text-sm text-amber-900">{keyMessage}</p> : null}
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
          <CopyLinkButton url={url} id="quotation-client-url" />
        </div>
      ) : keyMessage ? null : (
        <p className="mt-3 text-sm text-slate-600">{quotationCopy.clientLinkNone}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={rotate}>
          <input type="hidden" name="id" value={quotationId} />
          <button type="submit" className={ui.secondaryButton} disabled={rotatePending || revokePending}>
            {url || keyMessage ? quotationCopy.clientLinkRegenerate : quotationCopy.clientLinkCreate}
          </button>
        </form>
        {url || keyMessage ? (
          <form action={revoke}>
            <input type="hidden" name="id" value={quotationId} />
            <button type="submit" className={ui.secondaryButton} disabled={rotatePending || revokePending}>
              {quotationCopy.clientLinkRevoke}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
