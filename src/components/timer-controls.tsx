"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  idleTimerState,
  startTimerAction,
  stopTimerAction,
} from "@/app/timesheets/actions";
import { ClockIcon } from "@/components/icons";
import { MAX_ENTRY_MS, timeCopy } from "@/lib/time-copy";
import { formatElapsed } from "@/lib/timesheet";
import { ui } from "@/lib/ui";

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
  const [startState, startAction] = useActionState(startTimerAction, idleTimerState);
  const [stopState, stopAction] = useActionState(stopTimerAction, idleTimerState);
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = timer ? now - new Date(timer.startedAt).getTime() : 0;
  const overLong = Boolean(timer && elapsed > MAX_ENTRY_MS);
  const warnings = timer ? [] : stopState.warnings;

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
        <IdleTimer projects={projects} action={startAction} />
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
}: {
  projects: Array<{ id: string; name: string; clientName: string | null }>;
  action: (payload: FormData) => void;
}) {
  const [projectId, setProjectId] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label htmlFor="timer-project" className="sr-only">
        Project
      </label>
      <select
        id="timer-project"
        name="projectId"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
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
      <p className="text-sm text-slate-600">
        {projectId ? timeCopy.timerIdle : timeCopy.chooseProject}
      </p>
      <div className="sm:ml-auto">
        <StartButton disabled={!projectId} />
      </div>
    </form>
  );
}

function StartButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
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
