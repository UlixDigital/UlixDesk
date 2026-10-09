"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/cn";
import type { ClientOption } from "@/lib/project-display";
import { ui } from "@/lib/ui";
import type { ProjectFormState } from "@/lib/project-validation";

type SaveAction = (
  previous: ProjectFormState,
  formData: FormData,
) => Promise<ProjectFormState>;

export function ProjectForm({
  action,
  initialState,
  title,
  description,
  submitLabel,
  cancelHref,
  projectId,
  clients,
  badge,
  banner,
  autoFocusName = false,
  after,
}: {
  action: SaveAction;
  initialState: ProjectFormState;
  title: string;
  description: string;
  submitLabel: string;
  cancelHref: string;
  projectId?: string;
  clients: ClientOption[];
  badge?: "Active" | "Archived";
  banner?: ReactNode;
  autoFocusName?: boolean;
  after?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const serverKey = JSON.stringify(state.values);
  const [name, setName] = useSyncedState(state.values.name, serverKey);
  const [details, setDetails] = useSyncedState(
    state.values.description,
    serverKey,
  );
  const [clientId, setClientId] = useSyncedState(
    state.values.clientId,
    serverKey,
  );
  const [billable, setBillable] = useSyncedState(
    state.values.billable,
    serverKey,
  );
  const selectedClient = clients.find((client) => client.id === clientId);

  useEffect(() => {
    const order = ["name", "description", "clientId"] as const;
    const fieldIds = {
      name: "project-name",
      description: "project-description",
      clientId: "project-client",
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
              href="/projects"
              className="font-medium hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Projects
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
      >
        {projectId ? (
          <input type="hidden" name="id" value={projectId} readOnly />
        ) : null}
        {hasErrors ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {state.errors.form ?? "Check the highlighted fields and try again."}
          </div>
        ) : null}
        <Field
          id="project-name"
          label="Name"
          required
          error={state.errors.name}
        >
          <input
            id="project-name"
            name="name"
            type="text"
            required
            autoFocus={autoFocusName}
            autoComplete="off"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={state.errors.name ? true : undefined}
            aria-describedby={
              state.errors.name ? "project-name-error" : undefined
            }
            className={cn(ui.input, state.errors.name && ui.inputError)}
          />
        </Field>
        <Field
          id="project-description"
          label="Description"
          error={state.errors.description}
          hint="Optional details about the work."
        >
          <textarea
            id="project-description"
            name="description"
            rows={4}
            maxLength={2000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-invalid={state.errors.description ? true : undefined}
            aria-describedby={describedBy(
              "project-description-hint",
              state.errors.description ? "project-description-error" : undefined,
            )}
            className={cn(
              ui.input,
              "min-h-28 resize-y",
              state.errors.description && ui.inputError,
            )}
          />
        </Field>
        <Field
          id="project-client"
          label="Client"
          error={state.errors.clientId}
          hint={
            selectedClient?.archived
              ? undefined
              : "Choose one active client, or leave this blank."
          }
        >
          <select
            id="project-client"
            name="clientId"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            aria-invalid={state.errors.clientId ? true : undefined}
            aria-describedby={describedBy(
              selectedClient?.archived
                ? "project-client-archived"
                : "project-client-hint",
              state.errors.clientId ? "project-client-error" : undefined,
            )}
            className={cn(ui.input, state.errors.clientId && ui.inputError)}
          >
            <option value="">No client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.archived ? `${client.name} (Archived)` : client.name}
              </option>
            ))}
          </select>
          {selectedClient?.archived ? (
            <p
              id="project-client-archived"
              className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600"
            >
              <StatusBadge status="Archived" />
              <span>
                This client is archived. The project keeps this link until you
                choose an active client or clear it.
              </span>
            </p>
          ) : null}
        </Field>
        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
              <input
                id="project-billable"
                name="billable"
                type="checkbox"
                value="on"
                checked={billable}
                onChange={(event) => setBillable(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-teal-700 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
              />
            </span>
            <span>
              <span className="text-sm font-medium text-slate-800">
                Billable
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Time tracked on this project can be billed. On by default.
              </span>
            </span>
          </label>
        </div>
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

function useSyncedState<T>(value: T, serverKey: string) {
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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.primaryButton} disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}
