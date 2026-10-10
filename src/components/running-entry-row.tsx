"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { timeCopy } from "@/lib/time-copy";
import { formatElapsed, type RunningDailyEntry } from "@/lib/timesheet";
import { ui } from "@/lib/ui";

export function RunningEntryRow({
  entry,
  date,
  serverNow,
}: {
  entry: RunningDailyEntry;
  date: string;
  serverNow: number;
}) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = now - new Date(entry.startedAt).getTime();

  return (
    <li className="grid gap-3 bg-teal-50/40 px-4 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div>
        <p className="text-sm font-semibold text-slate-900">{entry.startLabel}</p>
        <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
          <span className="sr-only">Elapsed </span>
          {formatElapsed(elapsed)}
        </p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${entry.projectId}/edit`}
            className="text-sm font-semibold break-words text-slate-900 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {entry.projectName}
          </Link>
          {entry.projectArchived ? <StatusBadge status="Archived" /> : null}
          <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-900">
            {timeCopy.runningBadge}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {entry.clientName ?? "No client"}
          {" · "}
          {entry.billable ? "Billable" : "Non-billable"}
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
