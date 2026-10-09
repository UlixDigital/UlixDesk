"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { deleteTimeEntryAction } from "@/app/timesheets/actions";
import { timeCopy } from "@/lib/time-copy";
import { ui } from "@/lib/ui";

export function DeleteTimeEntryButton({
  id,
  date,
  label,
}: {
  id: string;
  date: string;
  label: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className={ui.secondaryButton}
        onClick={() => dialogRef.current?.showModal()}
      >
        Delete
        <span className="sr-only"> {label}</span>
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
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {timeCopy.deleteTitle}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {timeCopy.deleteBody}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <form method="dialog">
              <button type="submit" className={ui.secondaryButton}>
                Cancel
              </button>
            </form>
            <form action={deleteTimeEntryAction}>
              <input type="hidden" name="id" value={id} readOnly />
              <input type="hidden" name="date" value={date} readOnly />
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
      {pending ? timeCopy.deleting : timeCopy.deleteConfirm}
    </button>
  );
}
