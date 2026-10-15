import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { listClientsForFilter } from "@/lib/projects";
import {
  defaultGroupBy,
  parseReportSearchParams,
  resolveColumns,
  type ReportKind,
  type ReportQuery,
} from "@/lib/report-query";
import { buildReport, loadReportEntries, type BuiltReport } from "@/lib/reports";
import { listProjectsForTimesheetFilter } from "@/lib/time-entries";
import { todayInTimeZone, zonedDayEnd, zonedDayStart } from "@/lib/time-zone";
import { listActiveUsers } from "@/lib/users";
import { canManageWorkspace, canSeeMoney } from "@/lib/users-validation";

type Search = Record<string, string | string[] | undefined>;

export type PreparedReport = {
  timeZone: string;
  manager: boolean;
  showMoney: boolean;
  query: ReportQuery;
  /** Columns exactly as resolved for the screen and the CSV. */
  columns: string[];
  columnsInUrl: boolean;
  filtered: boolean;
  projects: Array<{ id: string; name: string; archivedAt: Date | null }>;
  clients: Array<{ id: string; name: string; archivedAt: Date | null }>;
  people: Array<{ id: string; name: string }>;
  failure: "range" | "large" | null;
  report: BuiltReport | null;
};

export async function prepareReport(input: {
  actor: { id: string; role: string };
  kind: ReportKind;
  params: Search;
  allRows?: boolean;
}): Promise<PreparedReport> {
  const timeZone = await getWorkspaceTimeZone();
  const today = todayInTimeZone(timeZone);
  const { query, rangeError } = parseReportSearchParams(input.params, today, input.kind);
  const manager = canManageWorkspace(input.actor.role);
  const showMoney = canSeeMoney(input.actor.role);
  const groupBy =
    !manager && query.groupBy === "member" ? defaultGroupBy(input.kind) : query.groupBy;
  const [projects, clients, people] = await Promise.all([
    listProjectsForTimesheetFilter(),
    listClientsForFilter(),
    manager ? listActiveUsers() : Promise.resolve([]),
  ]);
  const project = projects.find((item) => item.id === query.projectId) ?? null;
  const client = clients.find((item) => item.id === query.clientId) ?? null;
  const member = manager ? (people.find((person) => person.id === query.memberId) ?? null) : null;
  const columns = resolveColumns(input.kind, query.columns, showMoney, manager);
  const resolved: ReportQuery = {
    ...query,
    projectId: project?.id ?? "",
    clientId: client?.id ?? "",
    memberId: member?.id ?? "",
    groupBy,
    columns,
  };
  const filtered = Boolean(
    resolved.preset !== "this-week" ||
      resolved.memberId ||
      resolved.clientId ||
      resolved.projectId ||
      resolved.billable !== "all" ||
      resolved.groupBy !== defaultGroupBy(input.kind) ||
      query.columns,
  );
  const base = {
    timeZone,
    manager,
    showMoney,
    query: resolved,
    columns,
    columnsInUrl: query.columns !== null,
    filtered,
    projects,
    clients,
    people,
  };
  if (rangeError) {
    return { ...base, failure: "range", report: null };
  }
  const from = zonedDayStart(resolved.from, timeZone);
  const to = zonedDayEnd(resolved.to, timeZone);
  const loaded = await loadReportEntries({
    actor: input.actor,
    from,
    to,
    memberId: resolved.memberId || null,
    clientId: resolved.clientId || null,
    projectId: resolved.projectId || null,
    billable: resolved.billable,
    timeZone,
  });
  if (!loaded.ok) return { ...base, failure: "large", report: null };
  return {
    ...base,
    failure: null,
    report: buildReport({
      kind: input.kind,
      entries: loaded.entries,
      rangeStart: from,
      rangeEnd: to,
      timeZone,
      groupBy: resolved.groupBy,
      columns,
      showMoney: loaded.showMoney,
      manager: loaded.manager,
      page: resolved.page,
      allRows: input.allRows,
    }),
  };
}
