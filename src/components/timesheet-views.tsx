import Link from "next/link";
import { MoneyAmount, MoneySummary } from "@/components/money-summary";
import { rateCopy } from "@/lib/rate-copy";
import { DeleteTimeEntryButton } from "@/components/time-entry-delete";
import { RunningEntryRow } from "@/components/running-entry-row";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/cn";
import { formatMoneyTotals, type MoneyTotal } from "@/lib/money";
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
  type RunningDailyEntry,
  type TimesheetView,
  type WeeklyRow,
} from "@/lib/timesheet";
import { ui } from "@/lib/ui";

export function DailyTimesheet({
  date,
  rows,
  totalMs,
  moneyTotals = [],
  unrated = false,
  showMoney = false,
  canManage = true,
  running = null,
  serverNow,
}: {
  date: string;
  rows: DailyRow[];
  totalMs: number;
  moneyTotals?: MoneyTotal[];
  unrated?: boolean;
  showMoney?: boolean;
  canManage?: boolean;
  running?: RunningDailyEntry | null;
  serverNow: number;
}) {
  return (
    <div>
      <p className="mt-4 text-sm text-slate-600">
        {entryCountLabel(rows.length)} · {formatTrackedDuration(totalMs)}
      </p>
      {showMoney ? <MoneySummary totals={moneyTotals} unrated={unrated} /> : null}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
        <ul className="divide-y divide-slate-200">
          {running ? (
            <RunningEntryRow
              entry={running}
              date={date}
              serverNow={serverNow}
              canManage={canManage}
            />
          ) : null}
          {rows.map((row) => (
            <li key={row.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {row.startLabel} – {row.endLabel}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatTrackedDuration(row.durationMs)}
                  {showMoney ? (
                    <>
                      {" · "}
                      <MoneyAmount amount={row.amount} />
                    </>
                  ) : null}
                </p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ProjectName
                    canManage={canManage}
                    projectId={row.projectId}
                    name={row.projectName}
                    className="text-sm font-semibold break-words text-ink"
                  />
                  {row.projectArchived ? <StatusBadge status="Archived" /> : null}
                  <SourceBadge source={row.source} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {row.clientName ?? "No client"}
                  {" · "}
                  {row.billable ? rateCopy.billablePrefix : rateCopy.nonBillable}
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
  columnMoney = [],
  totalMs,
  moneyTotals = [],
  unrated = false,
  showMoney = false,
  canManage = true,
  projectId,
  clientId,
  user = "",
}: {
  dates: string[];
  today: string;
  rows: WeeklyRow[];
  columnTotals: number[];
  columnMoney?: MoneyTotal[][];
  totalMs: number;
  moneyTotals?: MoneyTotal[];
  unrated?: boolean;
  showMoney?: boolean;
  canManage?: boolean;
  projectId: string;
  clientId: string;
  user?: string;
}) {
  const moneyCaption = showMoney ? formatMoneyTotals(moneyTotals).join(", ") : "";
  return (
    <div className="mt-4">
      {showMoney ? <MoneySummary totals={moneyTotals} unrated={unrated} /> : null}
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
      <table className="min-w-[52rem] w-full table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          Weekly timesheet totaling {formatTrackedDuration(totalMs)}
          {moneyCaption ? `. ${moneyCaption}` : ""}
        </caption>
        <colgroup>
          <col className="w-44" />
          {dates.map((date) => (
            <col key={date} />
          ))}
          <col className="w-28" />
        </colgroup>
        <thead>
          <tr className="text-left text-xs font-medium text-slate-500">
            <th scope="col" className={cn(projectColumn, "z-20 border-b border-slate-200 px-4 py-3 font-medium")}>
              Project
            </th>
            {dates.map((date) => {
              const label = formatWeekdayLabel(date);
              return (
                <th
                  key={date}
                  scope="col"
                  className={cn(
                    "border-b border-slate-200 px-3 py-3 text-right font-medium",
                    date === today && "bg-primary-50 text-accent",
                  )}
                >
                  <span className="block">{label.weekday}</span>
                  <span className="mt-0.5 block font-normal">{label.day}</span>
                </th>
              );
            })}
            <th scope="col" className="border-b border-slate-200 px-4 py-3 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.projectId}>
              <th scope="row" className={cn(projectColumn, "border-b border-slate-100 px-4 py-3 text-left font-semibold text-ink")}>
                <ProjectName
                  canManage={canManage}
                  projectId={row.projectId}
                  name={row.projectName}
                  className="font-semibold text-ink"
                />
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  {row.clientName ?? "No client"}
                  {row.projectArchived ? " · Archived" : ""}
                </span>
              </th>
              {row.dayMs.map((value, index) => (
                <td
                  key={dates[index]}
                  className={cn(
                    "border-b border-slate-100 px-3 py-3 text-right tabular-nums text-slate-700",
                    dates[index] === today && "bg-primary-50/70",
                  )}
                >
                  {value > 0 ? (
                    <>
                      <Link
                        href={timesheetsHref({
                          view: "day",
                          date: dates[index],
                          projectId: projectId || row.projectId,
                          clientId,
                          user,
                        })}
                        className="hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {formatTrackedDuration(value)}
                      </Link>
                      {showMoney
                        ? formatMoneyTotals(row.dayMoney[index] ?? []).map((line) => (
                            <span key={line} className="mt-1 block text-[11px] leading-snug font-normal text-slate-600">
                              {line}
                            </span>
                          ))
                        : null}
                      {showMoney && row.dayNoAmount[index] ? (
                        <span className="mt-1 block text-[11px] leading-snug font-normal">
                          <MoneyAmount amount={null} />
                        </span>
                      ) : null}
                      {row.dayNonBillable[index] ? (
                        <span className="mt-1 block text-[11px] leading-snug font-normal text-slate-600">
                          {rateCopy.nonBillable}
                        </span>
                      ) : null}
                      {row.continuesFromPrevious[index] ? (
                        <span className="mt-1 block text-[11px] leading-snug font-normal text-slate-500">
                          {timeCopy.continuesPrevious}
                        </span>
                      ) : null}
                      {row.continuesToNext[index] ? (
                        <span className="mt-1 block text-[11px] leading-snug font-normal text-slate-500">
                          {timeCopy.continuesNext}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              ))}
              <td className="border-b border-slate-100 px-4 py-3 text-right font-semibold tabular-nums text-ink">
                {formatTrackedDuration(row.totalMs)}
                {showMoney ? <MoneyLines totals={row.totalMoney} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={cn(projectColumn, "border-t border-slate-200 px-4 py-3 text-left font-semibold text-ink")}>
              Total
            </th>
            {columnTotals.map((value, index) => (
              <td
                key={dates[index]}
                className={cn(
                  "border-t border-slate-200 px-3 py-3 text-right font-semibold tabular-nums text-ink",
                  dates[index] === today && "bg-primary-50/70",
                )}
              >
                {value > 0 ? (
                  <>
                    <div>{formatTrackedDuration(value)}</div>
                    {showMoney ? <MoneyLines totals={columnMoney[index] ?? []} /> : null}
                  </>
                ) : (
                  <span className="font-normal text-slate-500">—</span>
                )}
              </td>
            ))}
            <td className="border-t border-slate-200 px-4 py-3 text-right font-semibold tabular-nums text-ink">
              <div>{formatTrackedDuration(totalMs)}</div>
              {showMoney ? <MoneyLines totals={moneyTotals} /> : null}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}

const projectColumn =
  "sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgb(226_232_240)]";

function ProjectName({
  canManage,
  projectId,
  name,
  className,
}: {
  canManage: boolean;
  projectId: string;
  name: string;
  className: string;
}) {
  if (!canManage) return <span className={className}>{name}</span>;
  return (
    <Link
      href={`/projects/${projectId}/edit`}
      className={cn(
        className,
        "hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      {name}
    </Link>
  );
}

function MoneyLines({ totals }: { totals: MoneyTotal[] }) {
  const lines = formatMoneyTotals(totals);
  if (lines.length === 0) return null;
  return (
    <span className="mt-1 block text-[11px] leading-snug font-normal text-slate-600">
      {lines.join(" · ")}
    </span>
  );
}

export function TimesheetNav({
  view,
  date,
  today,
  projectId,
  clientId,
  user = "",
  heading,
}: {
  view: TimesheetView;
  date: string;
  today: string;
  projectId: string;
  clientId: string;
  user?: string;
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
      <h2 className="text-lg font-semibold text-ink">{heading}</h2>
      <div className="flex flex-wrap gap-2">
        <Link
          href={timesheetsHref({ view, date: previous, projectId, clientId, user })}
          className={ui.secondaryButton}
        >
          {view === "week" ? timeCopy.previousWeek : timeCopy.previousDay}
        </Link>
        <Link
          href={timesheetsHref({ view, date: today, projectId, clientId, user })}
          className={ui.secondaryButton}
          aria-current={onToday ? "date" : undefined}
        >
          {view === "week" ? timeCopy.thisWeek : timeCopy.today}
        </Link>
        <Link
          href={timesheetsHref({ view, date: next, projectId, clientId, user })}
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
