import type { Metadata } from "next";
import { TimeChangeFilters } from "@/components/time-change-filters";
import { TimeChangeList } from "@/components/time-change-list";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { listClientsForFilter } from "@/lib/projects";
import { getCurrentUser } from "@/lib/session";
import { timeChangeCodes, timeChangeCopy } from "@/lib/time-change-copy";
import {
  listTimeChanges,
  parseChangeAction,
  parseDateParam,
  parsePage,
} from "@/lib/time-changes";
import { listProjectsForTimesheetFilter } from "@/lib/time-entries";
import { startOfWeekDate, todayInTimeZone, weekDates, zonedDayEnd, zonedDayStart } from "@/lib/time-zone";
import { listActiveUsers } from "@/lib/users";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: "Manual time edits",
};

export default async function ManualTimeEditsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    member?: string;
    client?: string;
    project?: string;
    action?: string;
    page?: string;
  }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const timeZone = await getWorkspaceTimeZone();
  const params = await searchParams;
  const today = todayInTimeZone(timeZone);
  const defaultFrom = startOfWeekDate(today);
  const defaultTo = weekDates(today)[6];
  const from = parseDateParam(params.from, defaultFrom);
  const to = parseDateParam(params.to, defaultTo);
  const rangeError = from > to;
  const manager = canManageWorkspace(actor.role);
  const [projects, clients, people] = await Promise.all([
    listProjectsForTimesheetFilter(),
    listClientsForFilter(),
    manager ? listActiveUsers() : Promise.resolve([]),
  ]);
  const project = projects.find((item) => item.id === (params.project ?? "").trim()) ?? null;
  const client = clients.find((item) => item.id === (params.client ?? "").trim()) ?? null;
  const requestedMember = (params.member ?? "").trim();
  const member = manager ? (people.find((person) => person.id === requestedMember) ?? null) : null;
  const action = parseChangeAction(params.action);
  const projectId = project?.id ?? "";
  const clientId = client?.id ?? "";
  const memberId = member?.id ?? "";
  const filtered = Boolean(
    projectId ||
      clientId ||
      memberId ||
      action ||
      from !== defaultFrom ||
      to !== defaultTo,
  );
  const listed = rangeError
    ? { items: [], total: 0, page: 1, pageSize: 50, pageCount: 1 }
    : await listTimeChanges({
        actor,
        from: zonedDayStart(from, timeZone),
        to: zonedDayEnd(to, timeZone),
        timeZone,
        memberId: memberId || null,
        clientId: clientId || null,
        projectId: projectId || null,
        action,
        page: parsePage(params.page),
      });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{timeChangeCopy.pageTitle}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {manager ? timeChangeCopy.allScope : timeChangeCopy.ownScope} {timeChangeCopy.intro}
      </p>
      <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        {timeChangeCopy.historyNote}
      </p>
      <TimeChangeFilters
        from={from}
        to={to}
        memberId={memberId}
        clientId={clientId}
        projectId={projectId}
        action={action ?? ""}
        filtered={filtered}
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
        people={people.map((person) => ({ id: person.id, name: person.name }))}
      />
      {rangeError ? (
        <p
          role="alert"
          data-error-code={timeChangeCodes.RANGE_ORDER}
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {timeChangeCopy.rangeOrder}
        </p>
      ) : (
        <TimeChangeList
          items={listed.items}
          total={listed.total}
          page={listed.page}
          pageSize={listed.pageSize}
          pageCount={listed.pageCount}
          filtered={filtered}
          href={{
            from,
            to,
            memberId,
            clientId,
            projectId,
            action: action ?? "",
          }}
        />
      )}
    </div>
  );
}
