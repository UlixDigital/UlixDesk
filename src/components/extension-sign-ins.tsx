"use client";

import { useFormStatus } from "react-dom";
import { useId, useRef } from "react";
import { revokeExtensionSessionAction } from "@/app/settings/actions";
import { cn } from "@/lib/cn";
import { extensionSessionCopy, revokeSessionBody } from "@/lib/extension-session-copy";
import { formatTokenTimestamp, tokenCopy } from "@/lib/token-copy";
import { ui } from "@/lib/ui";

type SessionRow = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function ExtensionSignIns({
  sessions,
  timeZone,
}: {
  sessions: SessionRow[];
  timeZone: string;
}) {
  return (
    <section className="mt-8" aria-labelledby="extension-sign-in-heading">
      <h2 id="extension-sign-in-heading" className="text-lg font-semibold text-ink">
        {extensionSessionCopy.sessionsTitle}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{extensionSessionCopy.sessionsIntro}</p>
      {sessions.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h3 className="text-lg font-semibold text-ink">{extensionSessionCopy.emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{extensionSessionCopy.emptyBody}</p>
        </div>
      ) : (
        <div className="mt-4 w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "32%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {extensionSessionCopy.colDevice}
                </th>
                <th scope="col" className="px-4 py-3">
                  {tokenCopy.colCreated}
                </th>
                <th scope="col" className="px-4 py-3">
                  {tokenCopy.colLastUsed}
                </th>
                <th scope="col" className="px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <tr key={session.id}>
                  <th
                    scope="row"
                    title={session.label}
                    className="max-w-0 truncate px-4 py-3 font-medium text-ink"
                  >
                    {session.label}
                    {session.revokedAt ? (
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {tokenCopy.revoked}
                      </span>
                    ) : null}
                  </th>
                  <td className="max-w-0 overflow-hidden px-4 py-3 text-slate-700">
                    {formatTokenTimestamp(new Date(session.createdAt), timeZone)}
                  </td>
                  <td className="max-w-0 overflow-hidden px-4 py-3 text-slate-700">
                    {session.lastUsedAt
                      ? formatTokenTimestamp(new Date(session.lastUsedAt), timeZone)
                      : tokenCopy.notUsed}
                  </td>
                  <td className="max-w-0 overflow-hidden px-2 py-3 text-right">
                    {session.revokedAt ? null : (
                      <RevokeButton id={session.id} label={session.label} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RevokeButton({ id, label }: { id: string; label: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className={cn(ui.secondaryButton, "whitespace-nowrap px-2.5")}
        onClick={() => dialogRef.current?.showModal()}
      >
        {tokenCopy.revoke}
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
          <h2 id={titleId} className="text-lg font-semibold break-words text-ink">
            {extensionSessionCopy.revokeTitle}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {revokeSessionBody(label)}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <form method="dialog">
              <button type="submit" className={ui.secondaryButton}>
                {tokenCopy.cancel}
              </button>
            </form>
            <form action={revokeExtensionSessionAction}>
              <input type="hidden" name="id" value={id} readOnly />
              <RevokeConfirmButton />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}

function RevokeConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.dangerButton} disabled={pending}>
      {pending ? tokenCopy.revoking : extensionSessionCopy.revokeConfirm}
    </button>
  );
}
