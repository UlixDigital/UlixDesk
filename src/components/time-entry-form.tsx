"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { saveTimeEntryAction } from "@/app/timesheets/actions";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/cn";
import { timeCopy } from "@/lib/time-copy";
import { formatTrackedDuration } from "@/lib/timesheet";
import { ui } from "@/lib/ui";
import { zonedDateTimeToUtc } from "@/lib/time-zone";
import {
  billableDefault,
  intervalsOverlap,
  manualEntryEndsNextDay,
  resolveManualEndDate,
  type TimeEntryFormState,
} from "@/lib/time-validation";

type ProjectChoice = {
  id: string;
  name: string;
  billable: boolean;
  archived: boolean;
  clientName: string | null;
};

type OverlapCandidate = {
  id: string;
  startedAt: string;
  endedAt: string;
};

export function TimeEntryForm({
  initialState,
  title,
  description,
  submitLabel,
  cancelHref,
  entryId,
  projects,
  overlaps,
  timeZone,
  mode,
}: {
  initialState: TimeEntryFormState;
  title: string;
  description: string;
  submitLabel: string;
  cancelHref: string;
  entryId?: string;
  projects: ProjectChoice[];
  overlaps: OverlapCandidate[];
  timeZone: string;
  mode: "create" | "edit";
}) {
  const [state, formAction] = useActionState(saveTimeEntryAction, initialState);
  const serverKey = JSON.stringify(state.values);
  const [projectId, setProjectId] = useSyncedState(state.values.projectId, serverKey);
  const [date, setDate] = useSyncedState(state.values.date, serverKey);
  const [endDate, setEndDate] = useSyncedState(state.values.endDate, serverKey);
  const [startTime, setStartTime] = useSyncedState(state.values.startTime, serverKey);
  const [endTime, setEndTime] = useSyncedState(state.values.endTime, serverKey);
  const [billable, setBillable] = useSyncedState(state.values.billable, serverKey);
  const [note, setNote] = useSyncedState(state.values.note, serverKey);
  const [billableTouched, setBillableTouched] = useState(mode === "edit");
  const [seenTouch, setSeenTouch] = useState(serverKey);
  if (seenTouch !== serverKey) {
    setSeenTouch(serverKey);
    setBillableTouched(mode === "edit");
  }

  useEffect(() => {
    const order = ["projectId", "date", "endDate", "startTime", "endTime", "note"] as const;
    const fieldIds = {
      projectId: "entry-project",
      date: "entry-date",
      endDate: "entry-end-date",
      startTime: "entry-start",
      endTime: "entry-end",
      note: "entry-note",
    };
    for (const field of order) {
      if (state.errors[field]) {
        document.getElementById(fieldIds[field])?.focus();
        break;
      }
    }
  }, [state]);

  const resolvedEndDate = resolveManualEndDate({
    date,
    endDate,
    startTime,
    endTime,
  });
  const endsNextDay = manualEntryEndsNextDay({
    date,
    endDate,
    startTime,
    endTime,
  });
  const durationLabel = durationReadout(date, startTime, resolvedEndDate, endTime, timeZone);
  const overlap = hasLiveOverlap({
    date,
    startTime,
    endDate: resolvedEndDate,
    endTime,
    timeZone,
    overlaps,
    entryId,
  });
  const hasErrors = Object.values(state.errors).some(Boolean);
  const selected = projects.find((project) => project.id === projectId);

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link
              href={cancelHref}
              className="font-medium hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Timesheets
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-slate-900">{title}</li>
        </ol>
      </nav>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <form action={formAction} className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6" noValidate>
        {entryId ? <input type="hidden" name="id" value={entryId} readOnly /> : null}
        <input type="hidden" name="timeZone" value={timeZone} readOnly />
        <input type="hidden" name="billable" value={billable ? "true" : "false"} readOnly />
        {mode === "create" ? (
          <input type="hidden" name="endDate" value={resolvedEndDate} readOnly />
        ) : null}
        {hasErrors ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {state.errors.form ?? timeCopy.formAlert}
          </div>
        ) : null}
        {overlap ? (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {timeCopy.overlap}
          </p>
        ) : null}
        <Field id="entry-project" label="Project" required error={state.errors.projectId}>
          <select
            id="entry-project"
            name="projectId"
            required
            value={projectId}
            onChange={(event) => {
              const nextId = event.target.value;
              setProjectId(nextId);
              if (!billableTouched) setBillable(billableDefault(projects, nextId));
            }}
            aria-invalid={state.errors.projectId ? true : undefined}
            aria-describedby={state.errors.projectId ? "entry-project-error" : undefined}
            className={cn(ui.input, state.errors.projectId && ui.inputError)}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {projectLabel(project)}
              </option>
            ))}
          </select>
          {selected?.archived ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <StatusBadge status="Archived" />
              <span>This project is archived. New time can only use an active project.</span>
            </p>
          ) : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="entry-date" label="Date" required error={state.errors.date}>
            <input
              id="entry-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(event) => {
                const next = event.target.value;
                if (!endDate || endDate === date) setEndDate(next);
                setDate(next);
              }}
              aria-invalid={state.errors.date ? true : undefined}
              aria-describedby={state.errors.date ? "entry-date-error" : undefined}
              className={cn(ui.input, state.errors.date && ui.inputError)}
            />
          </Field>
          <Field id="entry-start" label="From" required error={state.errors.startTime}>
            <input
              id="entry-start"
              name="startTime"
              type="time"
              required
              step={60}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              aria-invalid={state.errors.startTime ? true : undefined}
              aria-describedby={state.errors.startTime ? "entry-start-error" : undefined}
              className={cn(ui.input, state.errors.startTime && ui.inputError)}
            />
          </Field>
          <Field id="entry-end" label="To" required error={state.errors.endTime}>
            <input
              id="entry-end"
              name="endTime"
              type="time"
              required
              step={60}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              aria-invalid={state.errors.endTime ? true : undefined}
              aria-describedby={state.errors.endTime ? "entry-end-error" : undefined}
              className={cn(ui.input, state.errors.endTime && ui.inputError)}
            />
          </Field>
        </div>
        {mode === "edit" && (resolvedEndDate !== date || state.errors.endDate) ? (
          <Field
            id="entry-end-date"
            label="End date"
            required
            error={state.errors.endDate}
            hint={timeCopy.endDateHint}
          >
            <input
              id="entry-end-date"
              name="endDate"
              type="date"
              required
              value={resolvedEndDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={state.errors.endDate ? true : undefined}
              aria-describedby={describedBy(
                "entry-end-date-hint",
                state.errors.endDate ? "entry-end-date-error" : undefined,
              )}
              className={cn(ui.input, state.errors.endDate && ui.inputError)}
            />
          </Field>
        ) : null}
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Duration</p>
          <p className="mt-1 text-lg font-semibold text-slate-900" aria-live="polite">
            {durationLabel}
            {endsNextDay ? (
              <span className="ml-3 text-sm font-medium text-slate-600">
                {timeCopy.endsNextDay}
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
              <input
                id="entry-billable"
                type="checkbox"
                checked={billable}
                onChange={(event) => {
                  setBillableTouched(true);
                  setBillable(event.target.checked);
                }}
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
              <span className="text-sm font-medium text-slate-800">Billable</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Starts from the project. You can change it for this entry.
              </span>
            </span>
          </label>
        </div>
        <Field id="entry-note" label="Note" error={state.errors.note} hint="Optional context for this block of time.">
          <textarea
            id="entry-note"
            name="note"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-invalid={state.errors.note ? true : undefined}
            aria-describedby={describedBy(
              "entry-note-hint",
              state.errors.note ? "entry-note-error" : undefined,
            )}
            className={cn(ui.input, "min-h-24 resize-y", state.errors.note && ui.inputError)}
          />
        </Field>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <Link href={cancelHref} className={ui.secondaryButton}>
            Cancel
          </Link>
          <SubmitButton label={submitLabel} />
        </div>
      </form>
    </div>
  );
}

function projectLabel(project: ProjectChoice) {
  const name = project.archived ? `${project.name} (Archived)` : project.name;
  return project.clientName ? `${name} · ${project.clientName}` : name;
}

function durationReadout(
  date: string,
  startTime: string,
  endDate: string,
  endTime: string,
  timeZone: string,
) {
  const start = zonedDateTimeToUtc(date, startTime, timeZone);
  const end = zonedDateTimeToUtc(endDate, endTime, timeZone);
  if (!start || !end || end <= start) return "—";
  return formatTrackedDuration(end.getTime() - start.getTime());
}

function hasLiveOverlap(input: {
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
  overlaps: OverlapCandidate[];
  entryId?: string;
}) {
  const start = zonedDateTimeToUtc(input.date, input.startTime, input.timeZone);
  const end = zonedDateTimeToUtc(input.endDate, input.endTime, input.timeZone);
  if (!start || !end || end <= start) return false;
  return input.overlaps.some((candidate) => {
    if (candidate.id === input.entryId) return false;
    return intervalsOverlap(
      start,
      end,
      new Date(candidate.startedAt),
      new Date(candidate.endedAt),
    );
  });
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
        {required ? null : <span className="text-xs text-slate-500">Optional</span>}
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
      {pending ? timeCopy.saving : label}
    </button>
  );
}
