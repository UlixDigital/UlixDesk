import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { listClientsForFilter } from "@/lib/projects";
import { firstSearchParam } from "@/lib/search-params";
import { listProjectsForTimesheetFilter } from "@/lib/time-entries";
import { actionFilterLabel, type ChangeActionFilter } from "@/lib/time-change-copy";
import {
  listTimeChanges,
  listTimeChangesForExport,
  parseChangeAction,
  parseDateParam,
  parsePage,
  type TimeChangeView,
} from "@/lib/time-changes";
import { startOfWeekDate, todayInTimeZone, weekDates, zonedDayEnd, zonedDayStart } from "@/lib/time-zone";
import { listActiveUsers } from "@/lib/users";
import { canManageWorkspace } from "@/lib/users-validation";

type Search = Record<string, string | string[] | undefined>;

export type PreparedTimeEdits = {
  timeZone: string;
  manager: boolean;
  from: string;
  to: string;
  memberId: string;
  clientId: string;
  projectId: string;
  action: ChangeActionFilter | "";
  memberName: string | null;
  clientName: string | null;
  projectName: string | null;
  actionLabel: string;
  filtered: boolean;
  projects: Array<{ id: string; name: string; archivedAt: Date | null }>;
  clients: Array<{ id: string; name: string; archivedAt: Date | null }>;
  people: Array<{ id: string; name: string }>;
  failure: "range" | "large" | null;
  items: TimeChangeView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function prepareTimeEdits(input: {
  actor: { id: string; role: string };
  params: Search;
  exportAll?: boolean;
}): Promise<PreparedTimeEdits> {
  const timeZone = await getWorkspaceTimeZone();
  const today = todayInTimeZone(timeZone);
  const defaultFrom = startOfWeekDate(today);
  const defaultTo = weekDates(today)[6];
  const from = parseDateParam(input.params.from, defaultFrom);
  const to = parseDateParam(input.params.to, defaultTo);
  const manager = canManageWorkspace(input.actor.role);
  const [projects, clients, people] = await Promise.all([
    listProjectsForTimesheetFilter(),
    listClientsForFilter(),
    manager ? listActiveUsers() : Promise.resolve([]),
  ]);
  const project = projects.find((item) => item.id === firstSearchParam(input.params.project)) ?? null;
  const client = clients.find((item) => item.id === firstSearchParam(input.params.client)) ?? null;
  const requestedMember = firstSearchParam(input.params.member);
  const member = manager ? (people.find((person) => person.id === requestedMember) ?? null) : null;
  const action = parseChangeAction(input.params.action);
  const projectId = project?.id ?? "";
  const clientId = client?.id ?? "";
  const memberId = member?.id ?? "";
  const filtered = Boolean(
    projectId || clientId || memberId || action || from !== defaultFrom || to !== defaultTo,
  );
  const selectedAction: ChangeActionFilter | "" = action ?? "";
  const base: Omit<
    PreparedTimeEdits,
    "failure" | "items" | "total" | "page" | "pageSize" | "pageCount"
  > = {
    timeZone,
    manager,
    from,
    to,
    memberId,
    clientId,
    projectId,
    action: selectedAction,
    memberName: member?.name ?? null,
    clientName: client?.name ?? null,
    projectName: project?.name ?? null,
    actionLabel: actionFilterLabel(action ?? ""),
    filtered,
    projects,
    clients,
    people,
  };
  if (from > to) {
    return {
      ...base,
      failure: "range",
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      pageCount: 1,
    };
  }
  const query = {
    actor: input.actor,
    from: zonedDayStart(from, timeZone),
    to: zonedDayEnd(to, timeZone),
    timeZone,
    memberId: memberId || null,
    clientId: clientId || null,
    projectId: projectId || null,
    action,
  };
  if (input.exportAll) {
    const exported = await listTimeChangesForExport(query);
    if (!exported.ok) {
      return { ...base, failure: "large", items: [], total: 0, page: 1, pageSize: 50, pageCount: 1 };
    }
    return {
      ...base,
      failure: null,
      items: exported.items,
      total: exported.items.length,
      page: 1,
      pageSize: Math.max(exported.items.length, 1),
      pageCount: 1,
    };
  }
  const listed = await listTimeChanges({ ...query, page: parsePage(input.params.page) });
  return { ...base, failure: null, ...listed };
}
