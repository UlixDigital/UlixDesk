import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { TimesheetFilters } from "@/components/timesheet-filters";
import { TimesheetEmptyState } from "@/components/timesheet-empty-state";
import {
  addTimeFor,
  DailyTimesheet,
  TimesheetNav,
  WeeklyTimesheet,
} from "@/components/timesheet-views";
import { budgetAlertForViewer } from "@/lib/budgets";
import { getWorkspaceTimeZone, listAllBillRates } from "@/lib/bill-rates";
import { getCurrentUser } from "@/lib/session";
import { attachRates } from "@/lib/rates";
import { cn } from "@/lib/cn";
import { listClientsForFilter } from "@/lib/projects";
import { listActiveUsers } from "@/lib/users";
import { canManageWorkspace, canSeeMoney } from "@/lib/users-validation";
import { timesheetWeekNote } from "@/lib/rate-copy";
import { timeCopy } from "@/lib/time-copy";
import {
  getRunningTimer,
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
  runningEntryForDay,
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
    user?: string;
    alertProject?: string;
  }>;
}) {
  const timeZone = await getWorkspaceTimeZone();

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
  const actor = await getCurrentUser();
  if (!actor) return null;
  const manager = canManageWorkspace(actor.role);
  const people = manager ? await listActiveUsers() : [];
  const requestedUser = (params.user ?? "").trim();
  const viewedUserId = !manager
    ? actor.id
    : requestedUser === "all"
      ? null
      : people.some((person) => person.id === requestedUser)
        ? requestedUser
        : actor.id;
  const userParam = viewedUserId === null ? "all" : viewedUserId === actor.id ? "" : viewedUserId;
  const now = new Date();
  const range = rangeFor(view, date, timeZone);
  const [entries, runningRecord, rates] = await Promise.all([
    listEntriesOverlapping({
      rangeStart: range.start,
      rangeEnd: range.end,
      projectId: projectId || undefined,
      clientId: clientId || undefined,
      userId: viewedUserId,
    }),
    view === "day" && viewedUserId ? getRunningTimer(viewedUserId) : Promise.resolve(null),
    canSeeMoney(actor.role) ? listAllBillRates() : Promise.resolve([]),
  ]);
  const priced = attachRates(actor.role, entries, rates, timeZone);
  const filtered = Boolean(projectId || clientId);
  const notice = parseNotice(params.notice);
  const budgetWarning =
    notice === "budget" || notice === "budget-overlap"
      ? await budgetAlertForViewer({
          userId: actor.id,
          projectId: params.alertProject ?? "",
          at: zonedDayStart(date, timeZone),
        })
      : null;
  const daily =
    view === "day"
      ? buildDailyTimesheet({ date, timeZone, entries: priced })
      : null;
  const running =
    view === "day"
      ? runningEntryForDay({
          date,
          timeZone,
          now,
          projectId,
          clientId,
          entry: runningRecord
            ? {
                id: runningRecord.id,
                projectId: runningRecord.projectId,
                projectName: runningRecord.project.name,
                projectArchived: runningRecord.project.archivedAt !== null,
                clientId: runningRecord.project.client?.id ?? null,
                clientName: runningRecord.project.client?.name ?? null,
                startedAt: runningRecord.startedAt,
                billable: runningRecord.billable,
                note: runningRecord.note,
                todoTitle: runningRecord.todo?.title ?? null,
              }
            : null,
        })
      : null;
  const weekly =
    view === "week"
      ? buildWeeklyTimesheet({ date, timeZone, entries: priced })
      : null;
  const empty =
    view === "day" ? daily!.rows.length === 0 && !running : weekly!.rows.length === 0;

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {viewedUserId === actor.id
              ? `Your time. ${timesheetWeekNote(timeZone)}`
              : viewedUserId === null
                ? `Everyone's time. ${timesheetWeekNote(timeZone)}`
                : `Time for the person you selected. ${timesheetWeekNote(timeZone)}`}
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
            href={timesheetsHref({ view: "day", date, projectId, clientId, user: userParam })}
            label="Daily"
            current={view === "day"}
          />
          <ViewTab
            href={timesheetsHref({ view: "week", date, projectId, clientId, user: userParam })}
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
        user={userParam}
        people={
          manager
            ? people
                .filter((person) => person.id !== actor.id)
                .map((person) => ({ id: person.id, name: person.name }))
            : []
        }
      />

      {notice === "overlap" || notice === "budget-overlap" ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {timeCopy.overlap}
        </p>
      ) : null}
      {budgetWarning ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {budgetWarning}
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
      {notice === "invoiced" ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {timeCopy.invoicedTime}
        </p>
      ) : null}

      <TimesheetNav
        view={view}
        date={date}
        today={today}
        projectId={projectId}
        clientId={clientId}
        user={userParam}
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
        <DailyTimesheet
          date={date}
          rows={daily.rows}
          totalMs={daily.totalMs}
          moneyTotals={daily.moneyTotals}
          unrated={daily.unrated}
          showMoney={canSeeMoney(actor.role)}
          canManage={manager}
          running={running}
          serverNow={now.getTime()}
        />
      ) : weekly ? (
        <WeeklyTimesheet
          dates={weekly.dates}
          today={today}
          rows={weekly.rows}
          columnTotals={weekly.columnTotals}
          columnMoney={weekly.columnMoney}
          totalMs={weekly.totalMs}
          moneyTotals={weekly.moneyTotals}
          unrated={weekly.unrated}
          showMoney={canSeeMoney(actor.role)}
          canManage={manager}
          projectId={projectId}
          clientId={clientId}
          user={userParam}
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
        "inline-flex items-center border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
        current
          ? "border-accent text-accent"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}
