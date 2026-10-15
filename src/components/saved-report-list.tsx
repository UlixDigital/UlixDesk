"use client";

import { useActionState, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  deleteSavedReportAction,
  idleSavedReportState,
  renameSavedReportAction,
} from "@/app/reports/actions";
import { reportCopy } from "@/lib/report-copy";
import { ui, textInputClass } from "@/lib/ui";

export type SavedReportListItem = {
  id: string;
  name: string;
  reportTitle: string;
  visibility: string;
  href: string | null;
  savedBy: string | null;
  canChange: boolean;
};

export function SavedReportList({ items }: { items: SavedReportListItem[] }) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-slate-600">{reportCopy.savedEmpty}</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-4" data-saved-report={item.name} data-visibility={item.visibility}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink">{item.name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {item.reportTitle}
                <span className="mx-1.5 text-slate-300" aria-hidden="true">
                  ·
                </span>
                {item.visibility === "shared" ? reportCopy.savedShared : reportCopy.savedPrivate}
                {item.savedBy ? (
                  <>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    {reportCopy.savedBy} {item.savedBy}
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.href ? (
                <Link href={item.href} className={ui.secondaryButton}>
                  {reportCopy.openSaved}
                </Link>
              ) : (
                <p className="text-sm text-slate-600">{reportCopy.savedUnavailable}</p>
              )}
              {item.canChange ? <RenameSavedReport id={item.id} name={item.name} /> : null}
              {item.canChange ? <DeleteSavedReport id={item.id} name={item.name} /> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RenameSavedReport({ id, name }: { id: string; name: string }) {
  const inputId = useId();
  const [state, formAction] = useActionState(renameSavedReportAction, idleSavedReportState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} readOnly />
      <label htmlFor={inputId} className="sr-only">
        {reportCopy.saveName}
      </label>
      <input
        id={inputId}
        name="name"
        required
        maxLength={80}
        defaultValue={name}
        className={`w-44 ${textInputClass(Boolean(state.error))}`}
      />
      <RenameButton />
      {state.error ? (
        <p role="alert" data-error-code={state.code || undefined} className="text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function RenameButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.secondaryButton} disabled={pending}>
      {reportCopy.renameSaved}
    </button>
  );
}

function DeleteSavedReport({ id, name }: { id: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [state, formAction] = useActionState(deleteSavedReportAction, idleSavedReportState);
  return (
    <>
      <button type="button" className={ui.secondaryButton} onClick={() => dialogRef.current?.showModal()}>
        {reportCopy.deleteSaved}
        <span className="sr-only"> {name}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
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
            {reportCopy.deleteSavedTitle}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {reportCopy.deleteSavedBody}
          </p>
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
            <form action={formAction}>
              <input type="hidden" name="id" value={id} readOnly />
              <ConfirmDelete />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.dangerButton} disabled={pending}>
      {reportCopy.deleteSaved}
    </button>
  );
}
