"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { keepControlledFormValues } from "@/components/keep-controlled-form";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";
import { isValidEmail, type ClientFormState } from "@/lib/validation";

type SaveAction = (
  previous: ClientFormState,
  formData: FormData,
) => Promise<ClientFormState>;

export function ClientForm({
  action,
  initialState,
  title,
  description,
  submitLabel,
  cancelHref,
  clientId,
  badge,
  banner,
  after,
  autoFocusName = false,
}: {
  action: SaveAction;
  initialState: ClientFormState;
  title: string;
  description: string;
  submitLabel: string;
  cancelHref: string;
  clientId?: string;
  badge?: "Active" | "Archived";
  banner?: ReactNode;
  after?: ReactNode;
  autoFocusName?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const serverKey = JSON.stringify(state.values);
  const [name, setName] = useSyncedState(state.values.name, serverKey);
  const [phone, setPhone] = useSyncedState(state.values.phone, serverKey);
  const [address, setAddress] = useSyncedState(state.values.address, serverKey);

  useEffect(() => {
    const order = ["name", "emails", "phone", "address"] as const;
    const fieldIds = {
      name: "client-name",
      emails: "client-email",
      phone: "client-phone",
      address: "client-address",
    };
    for (const field of order) {
      if (state.errors[field]) {
        document.getElementById(fieldIds[field])?.focus();
        break;
      }
    }
  }, [state]);

  const hasErrors = Object.values(state.errors).some(Boolean);

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link
              href="/clients"
              className="font-medium hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Clients
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-slate-900">{title}</li>
        </ol>
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {badge ? <StatusBadge status={badge} /> : null}
      </div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {banner ? <div className="mt-4">{banner}</div> : null}
      <form
        action={formAction}
        className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6"
        noValidate
        onReset={keepControlledFormValues}
      >
        {clientId ? (
          <input type="hidden" name="id" value={clientId} readOnly />
        ) : null}
        {hasErrors ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {state.errors.form ??
              "Check the highlighted fields and try again."}
          </div>
        ) : null}
        <Field
          id="client-name"
          label="Name"
          required
          error={state.errors.name}
        >
          <input
            id="client-name"
            name="name"
            type="text"
            required
            autoFocus={autoFocusName}
            autoComplete="organization"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={state.errors.name ? true : undefined}
            aria-describedby={state.errors.name ? "client-name-error" : undefined}
            className={cn(ui.input, state.errors.name && ui.inputError)}
          />
        </Field>
        <EmailField
          emails={state.values.emails}
          draft={state.values.emailDraft}
          error={state.errors.emails}
        />
        <Field id="client-phone" label="Phone" error={state.errors.phone}>
          <input
            id="client-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={state.errors.phone ? true : undefined}
            aria-describedby={
              state.errors.phone ? "client-phone-error" : undefined
            }
            className={cn(ui.input, state.errors.phone && ui.inputError)}
          />
        </Field>
        <Field
          id="client-address"
          label="Address"
          error={state.errors.address}
          hint="Street, city, and anything else you want on file."
        >
          <textarea
            id="client-address"
            name="address"
            rows={4}
            autoComplete="street-address"
            maxLength={1000}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-invalid={state.errors.address ? true : undefined}
            aria-describedby={describedBy(
              "client-address-hint",
              state.errors.address ? "client-address-error" : undefined,
            )}
            className={cn(
              ui.input,
              "min-h-28 resize-y",
              state.errors.address && ui.inputError,
            )}
          />
        </Field>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <Link href={cancelHref} className={ui.secondaryButton}>
            Cancel
          </Link>
          <SubmitButton label={submitLabel} />
        </div>
      </form>
      {after ? <div className="mt-8">{after}</div> : null}
    </div>
  );
}

function useSyncedState(value: string, serverKey: string) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(serverKey);
  if (seen !== serverKey) {
    setSeen(serverKey);
    setLocal(value);
  }
  return [local, setLocal] as const;
}

function describedBy(...ids: Array<string | undefined>) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function StatusBadge({ status }: { status: "Active" | "Archived" }) {
  const archived = status === "Archived";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        archived
          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          : "bg-teal-50 text-teal-800 ring-1 ring-teal-100",
      )}
    >
      {status}
    </span>
  );
}

function Field({
  id,
  label,
  required = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
          {required ? (
            <>
              <span className="text-rose-700" aria-hidden="true">
                {" "}
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </label>
        {required ? null : (
          <span className="text-xs text-slate-500">Optional</span>
        )}
      </div>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EmailField({
  emails,
  draft,
  error,
}: {
  emails: string[];
  draft: string;
  error?: string;
}) {
  const hintId = useId();
  const serverKey = JSON.stringify({ emails, draft });
  const [seenKey, setSeenKey] = useState(serverKey);
  const [localEmails, setLocalEmails] = useState(emails);
  const [localDraft, setLocalDraft] = useState(draft);
  const [localError, setLocalError] = useState<string | null>(null);

  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setLocalEmails(emails);
    setLocalDraft(draft);
    setLocalError(null);
  }

  const message = localError ?? error;

  function addEmails(raw: string) {
    const parts = raw
      .split(/[\s,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;

    const next = [...localEmails];
    const seen = new Set(next);
    let invalid: string | null = null;

    for (const part of parts) {
      if (!isValidEmail(part)) {
        invalid = part;
        break;
      }
      if (!seen.has(part)) {
        seen.add(part);
        next.push(part);
      }
    }

    if (invalid) {
      setLocalEmails(next);
      setLocalDraft(invalid);
      setLocalError(`"${invalid}" is not a valid email address.`);
      return;
    }

    if (next.length === localEmails.length) {
      setLocalDraft("");
      setLocalError("That email is already added.");
      return;
    }

    setLocalEmails(next);
    setLocalDraft("");
    setLocalError(null);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor="client-email" className="text-sm font-medium text-slate-800">
          Emails
        </label>
        <span className="text-xs text-slate-500">Optional</span>
      </div>
      <div
        className={cn(
          "rounded-lg border bg-white shadow-sm",
          message ? "border-rose-400" : "border-slate-300",
        )}
      >
        {localEmails.length > 0 ? (
          <ul aria-label="Email addresses" className="flex flex-wrap gap-2 px-3 pt-3">
            {localEmails.map((email) => (
              <li key={email}>
                <input type="hidden" name="emails" value={email} readOnly />
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 py-1 pr-1 pl-2.5 text-sm text-teal-950 ring-1 ring-teal-100">
                  <span className="max-w-[16rem] truncate">{email}</span>
                  <button
                    type="button"
                    className="rounded-full px-1.5 text-base leading-none text-teal-900 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    aria-label={`Remove ${email}`}
                    onClick={() => {
                      setLocalEmails(localEmails.filter((item) => item !== email));
                      setLocalError(null);
                    }}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col gap-2 p-2 sm:flex-row">
          <input
            id="client-email"
            name="emailDraft"
            type="text"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            placeholder="name@company.com"
            value={localDraft}
            aria-invalid={message ? true : undefined}
            aria-describedby={describedBy(
              hintId,
              message ? "client-email-error" : undefined,
            )}
            onChange={(event) => {
              setLocalDraft(event.target.value);
              setLocalError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addEmails(localDraft);
              }
            }}
            className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            className={ui.secondaryButton}
            onClick={() => addEmails(localDraft)}
            disabled={localDraft.trim() === ""}
          >
            Add email
          </button>
        </div>
      </div>
      <p id={hintId} className="mt-1.5 text-xs text-slate-500">
        Press Enter or choose Add email. You can add more than one.
      </p>
      {message ? (
        <p id="client-email-error" className="mt-1.5 text-sm text-rose-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.primaryButton} disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}
