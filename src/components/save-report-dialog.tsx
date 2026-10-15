"use client";

import { useActionState, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { idleSavedReportState, saveSavedReportAction } from "@/app/reports/actions";
import { reportCopy } from "@/lib/report-copy";
import { ui, textInputClass } from "@/lib/ui";

export function SaveReportDialog({
  fields,
  canShare,
}: {
  fields: Record<string, string>;
  canShare: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const nameId = useId();
  const [state, formAction] = useActionState(saveSavedReportAction, idleSavedReportState);

  return (
    <>
      <button type="button" className={ui.secondaryButton} onClick={() => dialogRef.current?.showModal()}>
        {reportCopy.saveReport}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="confirm-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div
          className="w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-white p-6 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {reportCopy.saveTitle}
          </h2>
          <form action={formAction} className="mt-4">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} readOnly />
            ))}
            <label htmlFor={nameId} className="text-sm font-medium text-slate-800">
              {reportCopy.saveName}
            </label>
            <input
              id={nameId}
              name="name"
              required
              maxLength={80}
              className={`mt-1.5 ${textInputClass(Boolean(state.error))}`}
            />
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-slate-800">{reportCopy.saveWho}</legend>
              <p className="mt-1 text-sm text-slate-600">{reportCopy.savePrivateHint}</p>
              {canShare ? (
                <label className="mt-3 flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" name="visibility" value="shared" className="mt-1" />
                  <span>
                    <span className="font-medium">{reportCopy.saveShared}</span>
                    <span className="mt-0.5 block text-slate-600">{reportCopy.saveSharedHint}</span>
                  </span>
                </label>
              ) : null}
            </fieldset>
            {state.error ? (
              <p
                role="alert"
                data-error-code={state.code || undefined}
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {state.error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={ui.secondaryButton} onClick={() => dialogRef.current?.close()}>
                {reportCopy.cancel}
              </button>
              <SaveButton />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.primaryButton} disabled={pending}>
      {reportCopy.saveSubmit}
    </button>
  );
}
