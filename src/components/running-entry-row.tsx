"use client";

import Link from "next/link";
import { useSharedNow } from "@/components/shared-now";
import { StatusBadge } from "@/components/status-badge";
import { rateCopy } from "@/lib/rate-copy";
import { timeCopy } from "@/lib/time-copy";
import { formatElapsed, type RunningDailyEntry } from "@/lib/timesheet";
import { ui } from "@/lib/ui";

export function RunningEntryRow({
  entry,
  date,
  serverNow,
  canManage = true,
}: {
  entry: RunningDailyEntry;
  date: string;
  serverNow: number;
  canManage?: boolean;
}) {
  const now = useSharedNow(serverNow);

  const elapsed = now - new Date(entry.startedAt).getTime();

  return (
    <li className="grid gap-3 bg-primary-50/40 px-4 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div>
        <p className="text-sm font-semibold text-ink">{entry.startLabel}</p>
        <p className="mt-1 font-mono text-sm font-semibold text-ink tabular-nums">
          <span className="sr-only">Elapsed </span>
          {formatElapsed(elapsed)}
        </p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <Link
              href={`/projects/${entry.projectId}/edit`}
              className="text-sm font-semibold break-words text-ink hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {entry.projectName}
            </Link>
          ) : (
            <span className="text-sm font-semibold break-words text-ink">{entry.projectName}</span>
          )}
          {entry.projectArchived ? <StatusBadge status="Archived" /> : null}
          <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-accent">
            {timeCopy.runningBadge}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {entry.clientName ?? "No client"}
          {" · "}
          {entry.billable ? rateCopy.billablePrefix : rateCopy.nonBillable}
        </p>
        {entry.note ? (
          <p className="mt-1 line-clamp-2 text-sm break-words text-slate-600">{entry.note}</p>
        ) : null}
        {entry.continuesFromPrevious ? (
          <p className="mt-1 text-xs text-slate-500">{timeCopy.continuesPrevious}</p>
        ) : null}
        {entry.continuesToNext ? (
          <p className="mt-1 text-xs text-slate-500">{timeCopy.continuesNext}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link
          href={`/timesheets/${entry.id}/edit?date=${date}`}
          className={ui.secondaryButton}
        >
          Open
          <span className="sr-only"> running entry for {entry.projectName}</span>
        </Link>
      </div>
    </li>
  );
}
