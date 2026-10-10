"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createAccessTokenAction, revokeAccessTokenAction } from "@/app/settings/actions";
import { submitWithoutFormReset } from "@/components/submit-without-form-reset";
import { KeyIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { formatTokenTimestamp, revokeTokenBody, tokenCopy } from "@/lib/token-copy";
import { emptyCreateTokenState } from "@/lib/token-form-state";
import { ui } from "@/lib/ui";

type TokenRow = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function AccessTokenSettings({
  tokens,
  timeZone,
}: {
  tokens: TokenRow[];
  timeZone: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createAccessTokenAction,
    emptyCreateTokenState,
  );
  const [name, setName] = useState(state.values.name);
  const [seenToken, setSeenToken] = useState<string | null>(null);
  const hasErrors = Boolean(state.errors.name || state.errors.form);

  useEffect(() => {
    if (!state.token || state.token === seenToken) return;
    setSeenToken(state.token);
    setName("");
    router.refresh();
  }, [router, seenToken, state.token]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {tokenCopy.pageTitle}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{tokenCopy.pageIntro}</p>

      {state.token ? (
        <TokenReveal token={state.token} name={state.tokenName ?? ""} />
      ) : null}

      <form
        action={formAction}
        className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6"
        noValidate
        onSubmit={(event) => submitWithoutFormReset(event, formAction)}
      >
        <h2 className="text-lg font-semibold text-slate-900">{tokenCopy.newToken}</h2>
        {hasErrors && state.errors.form ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {state.errors.form}
          </div>
        ) : null}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="token-name" className="text-sm font-medium text-slate-800">
              {tokenCopy.nameLabel}
              <span className="text-rose-700" aria-hidden="true">
                {" "}
                *
              </span>
              <span className="sr-only"> (required)</span>
            </label>
          </div>
          <input
            id="token-name"
            name="name"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={state.errors.name ? true : undefined}
            aria-describedby={
              state.errors.name ? "token-name-error token-name-hint" : "token-name-hint"
            }
            className={cn(ui.input, state.errors.name && ui.inputError)}
          />
          <p id="token-name-hint" className="mt-1.5 text-xs text-slate-500">
            {tokenCopy.nameHint}
          </p>
          {state.errors.name ? (
            <p id="token-name-error" className="mt-1.5 text-sm text-rose-700">
              {state.errors.name}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-slate-200 pt-5">
          <button type="submit" className={ui.primaryButton} disabled={isPending}>
            {isPending ? tokenCopy.creating : tokenCopy.create}
          </button>
        </div>
      </form>

      <section className="mt-8" aria-labelledby="access-token-list-heading">
        <h2
          id="access-token-list-heading"
          className="text-lg font-semibold text-slate-900"
        >
          {tokenCopy.listTitle}
        </h2>
        {tokens.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-800">
              <KeyIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              {tokenCopy.emptyTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              {tokenCopy.emptyBody}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {tokenCopy.colName}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {tokenCopy.colCreated}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {tokenCopy.colLastUsed}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {tokenCopy.colStatus}
                  </th>
                  <th scope="col" className="px-2 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <th scope="row" className="max-w-0 px-4 py-3 font-medium text-slate-900">
                      <span className="block truncate" title={token.name}>
                        {token.name}
                      </span>
                    </th>
                    <td className="px-4 py-3 text-slate-700">
                      {formatTokenTimestamp(new Date(token.createdAt), timeZone)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {token.lastUsedAt
                        ? formatTokenTimestamp(new Date(token.lastUsedAt), timeZone)
                        : tokenCopy.notUsed}
                    </td>
                    <td className="px-4 py-3">
                      <Status revoked={Boolean(token.revokedAt)} />
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      {token.revokedAt ? null : (
                        <RevokeButton id={token.id} name={token.name} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TokenReveal({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      inputRef.current?.select();
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <div
      role="status"
      className="mt-6 rounded-xl border border-teal-200 bg-teal-50 p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold text-teal-950">{tokenCopy.revealTitle}</h2>
      <p className="mt-2 text-sm text-teal-900">
        {tokenCopy.revealBody}
        {name ? <span className="sr-only"> Token name: {name}.</span> : null}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="new-access-token" className="sr-only">
          {tokenCopy.tokenLabel}
        </label>
        <input
          ref={inputRef}
          id="new-access-token"
          readOnly
          value={token}
          className={`${ui.input} font-mono`}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className={ui.secondaryButton} onClick={() => void copyToken()}>
          {copied ? tokenCopy.copied : tokenCopy.copy}
        </button>
      </div>
      {copyFailed ? (
        <p className="mt-2 text-sm text-teal-900">{tokenCopy.copyFailed}</p>
      ) : null}
    </div>
  );
}

function Status({ revoked }: { revoked: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        revoked
          ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
          : "bg-teal-50 text-teal-800 ring-1 ring-teal-100",
      )}
    >
      {revoked ? tokenCopy.revoked : tokenCopy.active}
    </span>
  );
}

function RevokeButton({ id, name }: { id: string; name: string }) {
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
          <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
            {tokenCopy.revokeTitle}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {revokeTokenBody(name)}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <form method="dialog">
              <button type="submit" className={ui.secondaryButton}>
                {tokenCopy.cancel}
              </button>
            </form>
            <form action={revokeAccessTokenAction}>
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
      {pending ? tokenCopy.revoking : tokenCopy.revokeConfirm}
    </button>
  );
}
