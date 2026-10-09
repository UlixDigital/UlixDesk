"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  archiveClientAction,
  restoreClientAction,
} from "@/app/clients/actions";
import { ui } from "@/lib/ui";

export function RestoreButton({ id, name }: { id: string; name: string }) {
  return (
    <form action={restoreClientAction}>
      <input type="hidden" name="id" value={id} readOnly />
      <RestoreSubmitButton name={name} />
    </form>
  );
}

function RestoreSubmitButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.primaryButton} disabled={pending}>
      {pending ? "Restoring…" : "Restore"}
      <span className="sr-only"> {name}</span>
    </button>
  );
}

export function ArchiveButton({ id, name }: { id: string; name: string }) {
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
        Archive
        <span className="sr-only"> {name}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="confirm-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        <div
          className="w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-white p-6 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <h2
            id={titleId}
            className="text-lg font-semibold break-words text-slate-900"
          >
            Archive {name}?
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {name} will move to the Archived tab. The record stays on file, and
            you can restore it at any time.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <form method="dialog">
              <button type="submit" className={ui.secondaryButton}>
                Cancel
              </button>
            </form>
            <form action={archiveClientAction}>
              <input type="hidden" name="id" value={id} readOnly />
              <ArchiveConfirmButton />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ArchiveConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.dangerButton} disabled={pending}>
      {pending ? "Archiving…" : "Archive client"}
    </button>
  );
}
