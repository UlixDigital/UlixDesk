import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { TimesheetFilters } from "@/components/timesheet-filters";
import { TimesheetEmptyState, TimezonePending } from "@/components/timesheet-empty-state";
import {
  addTimeFor,
  DailyTimesheet,
  TimesheetNav,
  WeeklyTimesheet,
} from "@/components/timesheet-views";
import { cn } from "@/lib/cn";
import { listClientsForFilter } from "@/lib/projects";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { timeCopy } from "@/lib/time-copy";
import {
  listEntriesOverlapping,
  listProjectsForTimesheetFilter,
} from "@/lib/time-entries";
import {
  buildDailyTimesheet,
  buildWeeklyTimesheet,
  formatDayHeading,
  formatWeekHeading,
  parseNotice,
  parseTimesheetView,
  timesheetsHref,
  type TimesheetView,
} from "@/lib/timesheet";
import {
  isRealCalendarDate,
  todayInTimeZone,
  weekDates,
  zonedDayEnd,
  zonedDayStart,
} from "@/lib/time-zone";
import { ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Timesheets",
};

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    project?: string;
    client?: string;
    notice?: string;
  }>;
}) {
  const timeZone = await getRequestTimeZone();
  if (!timeZone) return <TimezonePending />;

  const params = await searchParams;
  const view = parseTimesheetView(params.view);
  const requestedDate = (params.date ?? "").trim();
  const date = isRealCalendarDate(requestedDate)
    ? requestedDate
    : todayInTimeZone(timeZone);
  const today = todayInTimeZone(timeZone);
  const [projects, clients] = await Promise.all([
    listProjectsForTimesheetFilter(),
    listClientsForFilter(),
  ]);
  const project = projects.find((item) => item.id === (params.project ?? "").trim()) ?? null;
  const client = clients.find((item) => item.id === (params.client ?? "").trim()) ?? null;
  const projectId = project?.id ?? "";
  const clientId = client?.id ?? "";
  const range = rangeFor(view, date, timeZone);
  const entries = await listEntriesOverlapping({
    rangeStart: range.start,
    rangeEnd: range.end,
    projectId: projectId || undefined,
    clientId: clientId || undefined,
  });
  const filtered = Boolean(projectId || clientId);
  const notice = parseNotice(params.notice);
  const daily =
    view === "day"
      ? buildDailyTimesheet({ date, timeZone, entries })
      : null;
  const weekly =
    view === "week"
      ? buildWeeklyTimesheet({ date, timeZone, entries })
      : null;
  const empty = view === "day" ? daily!.rows.length === 0 : weekly!.rows.length === 0;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Time tracked against your projects. Weeks run Monday through Sunday.
          </p>
        </div>
        <Link href={addTimeFor(date, projectId)} className={ui.primaryButton}>
          <PlusIcon className="h-4 w-4" />
          {timeCopy.addTime}
        </Link>
      </div>

      <div className="mt-6 border-b border-slate-200">
        <nav aria-label="Timesheet view" className="-mb-px flex gap-6">
          <ViewTab
            href={timesheetsHref({ view: "day", date, projectId, clientId })}
            label="Daily"
            current={view === "day"}
          />
          <ViewTab
            href={timesheetsHref({ view: "week", date, projectId, clientId })}
            label="Weekly"
            current={view === "week"}
          />
        </nav>
      </div>

      <TimesheetFilters
        view={view}
        date={date}
        projectId={projectId}
        clientId={clientId}
        projects={projects.map((item) => ({
          id: item.id,
          name: item.name,
          archived: item.archivedAt !== null,
        }))}
        clients={clients.map((item) => ({
          id: item.id,
          name: item.name,
          archived: item.archivedAt !== null,
        }))}
      />

      {notice === "overlap" ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {timeCopy.overlap}
        </p>
      ) : null}
      {notice === "running" ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {timeCopy.stopBeforeDelete}
        </p>
      ) : null}

      <TimesheetNav
        view={view}
        date={date}
        today={today}
        projectId={projectId}
        clientId={clientId}
        heading={view === "week" ? formatWeekHeading(date) : formatDayHeading(date)}
      />

      {empty ? (
        <TimesheetEmptyState
          view={view}
          filtered={filtered}
          date={date}
          addHref={addTimeFor(date, projectId)}
        />
      ) : view === "day" && daily ? (
        <DailyTimesheet date={date} rows={daily.rows} totalMs={daily.totalMs} />
      ) : weekly ? (
        <WeeklyTimesheet
          dates={weekly.dates}
          today={today}
          rows={weekly.rows}
          columnTotals={weekly.columnTotals}
          totalMs={weekly.totalMs}
          projectId={projectId}
          clientId={clientId}
        />
      ) : null}
    </div>
  );
}

function rangeFor(view: TimesheetView, date: string, timeZone: string) {
  if (view === "week") {
    const days = weekDates(date);
    return {
      start: zonedDayStart(days[0], timeZone),
      end: zonedDayEnd(days[6], timeZone),
    };
  }
  return {
    start: zonedDayStart(date, timeZone),
    end: zonedDayEnd(date, timeZone),
  };
}

function ViewTab({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex items-center border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700",
        current
          ? "border-teal-700 text-teal-800"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      {label}
    </Link>
  );
}
