"use client";

import { useActionState } from "react";
import {
  convertQuotationAction,
  decideQuotationAction,
  duplicateQuotationAction,
  type QuotationFormState,
} from "@/app/quotations/actions";
import { quotationCopy } from "@/lib/quotation-copy";
import { ui } from "@/lib/ui";

const idle: QuotationFormState = { error: null, notice: null };

export function QuotationActions({
  quotationId,
  canDecide,
  canConvert,
}: {
  quotationId: string;
  canDecide: boolean;
  canConvert: boolean;
}) {
  const [duplicateState, duplicate, duplicatePending] = useActionState(duplicateQuotationAction, idle);
  const [acceptState, accept, acceptPending] = useActionState(decideQuotationAction, idle);
  const [declineState, decline, declinePending] = useActionState(decideQuotationAction, idle);
  const [convertState, convert, convertPending] = useActionState(convertQuotationAction, idle);
  const error = duplicateState.error ?? acceptState.error ?? declineState.error ?? convertState.error;
  return (
    <div className="mt-8 space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <form action={duplicate}>
          <input type="hidden" name="id" value={quotationId} />
          <button type="submit" className={ui.secondaryButton} disabled={duplicatePending}>
            {quotationCopy.duplicate}
          </button>
        </form>
        {canDecide ? (
          <>
            <form action={accept}>
              <input type="hidden" name="id" value={quotationId} />
              <input type="hidden" name="decision" value="accepted" />
              <button type="submit" className={ui.secondaryButton} disabled={acceptPending}>
                {quotationCopy.accept}
              </button>
            </form>
            <form action={decline}>
              <input type="hidden" name="id" value={quotationId} />
              <input type="hidden" name="decision" value="declined" />
              <button type="submit" className={ui.secondaryButton} disabled={declinePending}>
                {quotationCopy.decline}
              </button>
            </form>
          </>
        ) : null}
        {canConvert ? (
          <form action={convert}>
            <input type="hidden" name="id" value={quotationId} />
            <button type="submit" className={ui.primaryButton} disabled={convertPending}>
              {quotationCopy.convert}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
