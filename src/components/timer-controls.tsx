"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  startTimerAction,
  stopTimerAction,
  type TimerActionState,
} from "@/app/timesheets/actions";
import { ClockIcon } from "@/components/icons";
import { useSharedNow } from "@/components/shared-now";
import { submitWithoutFormReset } from "@/components/submit-without-form-reset";
import { MAX_ENTRY_MS, timeCopy } from "@/lib/time-copy";
import { formatElapsed } from "@/lib/timesheet";
import { ui } from "@/lib/ui";

export const TIMER_PROJECT_KEY = "ulixdesk-timer-project";

const idleTimerState: TimerActionState = { error: null, warnings: [] };

type TimerSnapshot = {
  projectName: string;
  clientName: string | null;
  startedAt: string;
};

export function TimerControls({
  projects,
  timer,
  serverNow,
}: {
  projects: Array<{ id: string; name: string; clientName: string | null }>;
  timer: TimerSnapshot | null;
  serverNow: number;
}) {
  const [startState, startAction, startPending] = useActionState(
    startTimerAction,
    idleTimerState,
  );
  const [stopState, stopAction] = useActionState(stopTimerAction, idleTimerState);
  const now = useSharedNow(serverNow);
  const [projectId, setProjectId] = useState("");
  const [rememberedProjectId, setRememberedProjectId] = useState("");
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  useEffect(() => {
    const remembered = projectIdRef.current || readTimerProject();
    const stillActive = Boolean(
      remembered && projects.some((project) => project.id === remembered),
    );
    if (stillActive) {
      setProjectId(remembered);
      setRememberedProjectId(remembered);
      return;
    }
    setProjectId("");
    setRememberedProjectId(remembered);
  }, [projects]);

  useEffect(() => {
    if (projectId) writeTimerProject(projectId);
  }, [projectId]);

  const projectNotice =
    rememberedProjectId &&
    !projectId &&
    !projects.some((project) => project.id === rememberedProjectId)
      ? timeCopy.timerProjectGone
      : null;

  const elapsed = timer ? now - new Date(timer.startedAt).getTime() : 0;
  const overLong = Boolean(timer && elapsed > MAX_ENTRY_MS);
  const warnings = timer ? [] : (stopState.warnings ?? []);

  return (
    <div>
      {timer ? (
        <form action={stopAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <TimerIdentity
            title={timer.projectName}
            detail={timer.clientName}
          />
          <p className="font-mono text-lg font-semibold tracking-tight text-slate-900 tabular-nums">
            <span className="sr-only">Elapsed time </span>
            {formatElapsed(elapsed)}
          </p>
          <div className="sm:ml-auto">
            <StopButton />
          </div>
        </form>
      ) : projects.length === 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TimerIdentity title={timeCopy.timerIdle} detail={timeCopy.noProjects} />
          <Link href="/projects/new" className={ui.primaryButton}>
            {timeCopy.addProject}
          </Link>
        </div>
      ) : (
        <IdleTimer
          projects={projects}
          action={startAction}
          pending={startPending}
          projectId={projectId}
          notice={projectNotice}
          onProjectId={(next) => {
            setProjectId(next);
            setRememberedProjectId(next);
            writeTimerProject(next);
          }}
        />
      )}
      <TimerMessages
        error={timer ? stopState.error ?? startState.error : startState.error}
        warnings={warnings}
        overLong={overLong}
      />
    </div>
  );
}

function TimerIdentity({
  title,
  detail,
}: {
  title: string;
  detail: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
        <ClockIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900">
          {title}
        </span>
        {detail ? (
          <span className="block truncate text-xs text-slate-500">{detail}</span>
        ) : null}
      </span>
    </div>
  );
}

function TimerMessages({
  error,
  warnings,
  overLong,
}: {
  error: string | null;
  warnings: string[];
  overLong: boolean;
}) {
  if (!error && warnings.length === 0 && !overLong) return null;
  return (
    <div className="mt-3 space-y-2">
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {overLong ? (
        <p role="status" className="text-sm text-amber-800">
          {timeCopy.timerLong}
        </p>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} role="status" className="text-sm text-amber-800">
          {warning}
        </p>
      ))}
    </div>
  );
}

function IdleTimer({
  projects,
  action,
  pending,
  projectId,
  notice,
  onProjectId,
}: {
  projects: Array<{ id: string; name: string; clientName: string | null }>;
  action: (payload: FormData) => void;
  pending: boolean;
  projectId: string;
  notice: string | null;
  onProjectId: (projectId: string) => void;
}) {
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
      onSubmit={(event) => submitWithoutFormReset(event, action)}
    >
      <label htmlFor="timer-project" className="sr-only">
        Project
      </label>
      <select
        id="timer-project"
        name="projectId"
        value={projectId}
        onChange={(event) => onProjectId(event.target.value)}
        className={`${ui.input} sm:max-w-xs`}
      >
        <option value="">Project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.clientName
              ? `${project.name} · ${project.clientName}`
              : project.name}
          </option>
        ))}
      </select>
      <p
        role={notice ? "status" : undefined}
        className={notice ? "text-sm text-amber-800" : "text-sm text-slate-600"}
      >
        {notice ?? (projectId ? timeCopy.timerIdle : timeCopy.chooseProject)}
      </p>
      <div className="sm:ml-auto">
        <StartButton disabled={!projectId} pending={pending} />
      </div>
    </form>
  );
}

function readTimerProject() {
  try {
    return window.sessionStorage.getItem(TIMER_PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeTimerProject(projectId: string) {
  try {
    if (projectId) window.sessionStorage.setItem(TIMER_PROJECT_KEY, projectId);
    else window.sessionStorage.removeItem(TIMER_PROJECT_KEY);
  } catch {
    // The select still works for this page load when storage is blocked.
  }
}

function StartButton({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  return (
    <button
      type="submit"
      className={ui.primaryButton}
      disabled={disabled || pending}
    >
      {pending ? timeCopy.starting : timeCopy.start}
    </button>
  );
}

function StopButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.dangerButton} disabled={pending}>
      {pending ? timeCopy.stopping : timeCopy.stop}
    </button>
  );
}
