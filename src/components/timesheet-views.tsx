import Link from "next/link";
import { DeleteTimeEntryButton } from "@/components/time-entry-delete";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/cn";
import { timeCopy } from "@/lib/time-copy";
import { startOfWeekDate } from "@/lib/time-zone";
import {
  entryCountLabel,
  formatTrackedDuration,
  formatWeekdayLabel,
  newTimeEntryHref,
  shiftTimesheetDate,
  timesheetsHref,
  type DailyRow,
  type TimesheetView,
  type WeeklyRow,
} from "@/lib/timesheet";
import { ui } from "@/lib/ui";

export function DailyTimesheet({
  date,
  rows,
  totalMs,
}: {
  date: string;
  rows: DailyRow[];
  totalMs: number;
}) {
  return (
    <div>
      <p className="mt-4 text-sm text-slate-600">
        {entryCountLabel(rows.length)} · {formatTrackedDuration(totalMs)}
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
        <ul className="divide-y divide-slate-200">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {row.startLabel} – {row.endLabel}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatTrackedDuration(row.durationMs)}
                </p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/projects/${row.projectId}/edit`}
                    className="text-sm font-semibold break-words text-slate-900 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    {row.projectName}
                  </Link>
                  {row.projectArchived ? <StatusBadge status="Archived" /> : null}
                  <SourceBadge source={row.source} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {row.clientName ?? "No client"}
                  {" · "}
                  {row.billable ? "Billable" : "Non-billable"}
                </p>
                {row.note ? (
                  <p className="mt-1 line-clamp-2 text-sm break-words text-slate-600">
                    {row.note}
                  </p>
                ) : null}
                {row.continuesFromPrevious ? (
                  <p className="mt-1 text-xs text-slate-500">{timeCopy.continuesPrevious}</p>
                ) : null}
                {row.continuesToNext ? (
                  <p className="mt-1 text-xs text-slate-500">{timeCopy.continuesNext}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Link
                  href={`/timesheets/${row.id}/edit?date=${date}`}
                  className={ui.secondaryButton}
                >
                  Edit
                  <span className="sr-only"> {row.projectName}</span>
                </Link>
                <DeleteTimeEntryButton
                  id={row.id}
                  date={date}
                  label={`${row.projectName} ${row.startLabel}`}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function WeeklyTimesheet({
  dates,
  today,
  rows,
  columnTotals,
  totalMs,
  projectId,
  clientId,
}: {
  dates: string[];
  today: string;
  rows: WeeklyRow[];
  columnTotals: number[];
  totalMs: number;
  projectId: string;
  clientId: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
      <table className="min-w-[52rem] w-full border-collapse text-sm">
        <caption className="sr-only">
          Weekly timesheet totaling {formatTrackedDuration(totalMs)}
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
            <th scope="col" className="px-4 py-3 font-medium">
              Project
            </th>
            {dates.map((date) => {
              const label = formatWeekdayLabel(date);
              return (
                <th
                  key={date}
                  scope="col"
                  className={cn(
                    "px-3 py-3 text-right font-medium",
                    date === today && "bg-teal-50 text-teal-800",
                  )}
                >
                  <span className="block">{label.weekday}</span>
                  <span className="mt-0.5 block font-normal">{label.day}</span>
                </th>
              );
            })}
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.projectId} className="border-b border-slate-100">
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900">
                <Link
                  href={`/projects/${row.projectId}/edit`}
                  className="hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  {row.projectName}
                </Link>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  {row.clientName ?? "No client"}
                  {row.projectArchived ? " · Archived" : ""}
                </span>
              </th>
              {row.dayMs.map((value, index) => (
                <td
                  key={dates[index]}
                  className={cn(
                    "px-3 py-3 text-right tabular-nums text-slate-700",
                    dates[index] === today && "bg-teal-50/70",
                  )}
                >
                  {value > 0 ? (
                    <Link
                      href={timesheetsHref({
                        view: "day",
                        date: dates[index],
                        projectId: projectId || row.projectId,
                        clientId,
                      })}
                      className="hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    >
                      {formatTrackedDuration(value)}
                    </Link>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                {formatTrackedDuration(row.totalMs)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200">
            <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900">
              Total
            </th>
            {columnTotals.map((value, index) => (
              <td
                key={dates[index]}
                className={cn(
                  "px-3 py-3 text-right font-semibold tabular-nums text-slate-900",
                  dates[index] === today && "bg-teal-50/70",
                )}
              >
                {formatTrackedDuration(value)}
              </td>
            ))}
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
              {formatTrackedDuration(totalMs)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function TimesheetNav({
  view,
  date,
  today,
  projectId,
  clientId,
  heading,
}: {
  view: TimesheetView;
  date: string;
  today: string;
  projectId: string;
  clientId: string;
  heading: string;
}) {
  const previous = shiftTimesheetDate(date, view, -1);
  const next = shiftTimesheetDate(date, view, 1);
  const onToday =
    view === "week"
      ? startOfWeekDate(date) === startOfWeekDate(today)
      : date === today;
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
      <div className="flex flex-wrap gap-2">
        <Link
          href={timesheetsHref({ view, date: previous, projectId, clientId })}
          className={ui.secondaryButton}
        >
          {view === "week" ? timeCopy.previousWeek : timeCopy.previousDay}
        </Link>
        <Link
          href={timesheetsHref({ view, date: today, projectId, clientId })}
          className={ui.secondaryButton}
          aria-current={onToday ? "date" : undefined}
        >
          {view === "week" ? timeCopy.thisWeek : timeCopy.today}
        </Link>
        <Link
          href={timesheetsHref({ view, date: next, projectId, clientId })}
          className={ui.secondaryButton}
        >
          {view === "week" ? timeCopy.nextWeek : timeCopy.nextDay}
        </Link>
      </div>
    </div>
  );
}

export function addTimeFor(date: string, projectId: string) {
  return newTimeEntryHref(date, projectId);
}

function SourceBadge({ source }: { source: "manual" | "timer" }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      {source === "timer" ? "Timer" : "Manual"}
    </span>
  );
}
