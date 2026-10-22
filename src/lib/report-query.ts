import { isCurrencyCode } from "@/lib/currencies";
import { reportCopy } from "@/lib/report-copy";
import {
  firstSearchParam,
  parseBoundedDate,
  parseEnumParam,
  parsePageParam,
} from "@/lib/search-params";
import { formatDayHeading } from "@/lib/timesheet";
import { addCalendarDays, isRealCalendarDate, startOfWeekDate } from "@/lib/time-zone";

export const reportKinds = ["time-activity", "daily", "weekly", "work-sessions"] as const;
export type ReportKind = (typeof reportKinds)[number];

export const reportPresets = [
  "today",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "custom",
] as const;
export type ReportPreset = (typeof reportPresets)[number];

export const groupByOptions = ["member", "client", "project", "todo", "date"] as const;
export type GroupBy = (typeof groupByOptions)[number];

export const activitySortKeys = ["name", "time", "billable", "amount", "date"] as const;
export type ActivitySortKey = (typeof activitySortKeys)[number];

export const sortDirections = ["asc", "desc"] as const;
export type SortDirection = (typeof sortDirections)[number];

/** One sort for every group level. Amount sorts never add currencies together. */
export type ActivitySort = {
  key: ActivitySortKey;
  direction: SortDirection;
  /** A currency column. Null compares each currency in code order. */
  currency: string | null;
};

const ACTIVITY_SORT_PATTERN = /^(name|time|billable|date|amount)(?:-([A-Z]{3}))?-(asc|desc)$/;

export const billableFilters = ["all", "billable", "non-billable"] as const;
export type BillableFilter = (typeof billableFilters)[number];

export const REPORT_PAGE_SIZE = 50;
/** Stop a report or its CSV before a huge range loads every row into memory. */
export const REPORT_ROW_CAP = 5000;

export function isReportKind(value: string): value is ReportKind {
  return (reportKinds as readonly string[]).includes(value);
}

export type ReportQuery = {
  preset: ReportPreset;
  from: string;
  to: string;
  memberId: string;
  clientId: string;
  projectId: string;
  todoId: string;
  billable: BillableFilter;
  groupBy: GroupBy;
  /** Second group for Time & Activity. Null when the report has one level. */
  groupBy2: GroupBy | null;
  sort: ActivitySort;
  /** Null when the URL has no columns key. The page then uses the defaults. */
  columns: string[] | null;
  page: number;
};

type SearchInput = Record<string, string | string[] | undefined>;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthBounds(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last)}`,
  };
}

/** Named presets. Custom dates come from the query string. */
export function rangeForPreset(
  preset: Exclude<ReportPreset, "custom">,
  today: string,
): { from: string; to: string } {
  if (!isRealCalendarDate(today)) {
    throw new Error("today must be a real calendar date.");
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (preset === "today") return { from: today, to: today };
  if (preset === "this-week" || preset === "last-week") {
    const start = startOfWeekDate(today);
    const monday = preset === "last-week" ? addCalendarDays(start, -7) : start;
    return { from: monday, to: addCalendarDays(monday, 6) };
  }
  if (preset === "this-month") return monthBounds(year, month);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return monthBounds(prevYear, prevMonth);
}

/** Daily opens as one row per day. The other reports open grouped by project. */
export function defaultGroupBy(kind: ReportKind): GroupBy {
  return kind === "daily" ? "date" : "project";
}

/** Dates open oldest first. Every other group opens A-Z. */
export function defaultActivitySort(groupBy: GroupBy): ActivitySort {
  if (groupBy === "date") return { key: "date", direction: "asc", currency: null };
  return { key: "name", direction: "asc", currency: null };
}

export function activitySortToken(sort: ActivitySort) {
  if (sort.key === "amount" && sort.currency) return `amount-${sort.currency}-${sort.direction}`;
  return `${sort.key}-${sort.direction}`;
}

export function isDefaultActivitySort(groupBy: GroupBy, sort: ActivitySort) {
  return activitySortToken(sort) === activitySortToken(defaultActivitySort(groupBy));
}

/** `time-desc`, `amount-USD-asc`. Anything else is ignored. */
export function parseActivitySort(value: string | string[] | undefined | null): ActivitySort | null {
  const match = ACTIVITY_SORT_PATTERN.exec(firstSearchParam(value));
  if (!match) return null;
  const key = match[1] as ActivitySortKey;
  const currency = match[2] ?? null;
  const direction = match[3] as SortDirection;
  if (currency && (key !== "amount" || !isCurrencyCode(currency))) return null;
  return { key, direction, currency: key === "amount" ? currency : null };
}

export function activitySortChoices(showMoney: boolean) {
  const choices: Array<{ value: string; label: string }> = [
    { value: "name-asc", label: reportCopy.sortNameAsc },
    { value: "name-desc", label: reportCopy.sortNameDesc },
    { value: "time-desc", label: reportCopy.sortTimeDesc },
    { value: "time-asc", label: reportCopy.sortTimeAsc },
    { value: "billable-desc", label: reportCopy.sortBillableDesc },
    { value: "billable-asc", label: reportCopy.sortBillableAsc },
  ];
  if (showMoney) {
    choices.push(
      { value: "amount-desc", label: reportCopy.sortAmountDesc },
      { value: "amount-asc", label: reportCopy.sortAmountAsc },
    );
  }
  choices.push(
    { value: "date-desc", label: reportCopy.sortDateDesc },
    { value: "date-asc", label: reportCopy.sortDateAsc },
  );
  return choices;
}

export function activitySortLabel(sort: ActivitySort) {
  if (sort.key === "amount" && sort.currency) {
    const way = sort.direction === "desc" ? "high to low" : "low to high";
    return `${reportCopy.amount} (${sort.currency}) ${way}`;
  }
  const token = activitySortToken(sort);
  return activitySortChoices(true).find((choice) => choice.value === token)?.label ?? token;
}

/** True when the URL named a group, a second group, or a sort. Those win over the remembered view. */
export function reportViewInUrl(params: SearchInput) {
  return (
    firstSearchParam(params.group) !== "" ||
    firstSearchParam(params.then) !== "" ||
    firstSearchParam(params.sort) !== ""
  );
}

export function parseReportSearchParams(
  params: SearchInput,
  today: string,
  kind: ReportKind = "time-activity",
): {
  query: ReportQuery;
  rangeError: boolean;
  /** The raw URL named group, then, or sort. Remembered choices must not replace it. */
  viewInUrl: boolean;
} {
  const preset = parseEnumParam(params.preset, reportPresets) ?? "this-week";
  const fallback = rangeForPreset("this-week", today);
  const range = preset === "custom" ? null : rangeForPreset(preset, today);
  const from =
    preset === "custom" ? parseBoundedDate(params.from, fallback.from) : (range?.from ?? fallback.from);
  const to =
    preset === "custom" ? parseBoundedDate(params.to, fallback.to) : (range?.to ?? fallback.to);
  const groupBy = parseEnumParam(params.group, groupByOptions) ?? defaultGroupBy(kind);
  return {
    query: {
      preset,
      from,
      to,
      memberId: firstSearchParam(params.member),
      clientId: firstSearchParam(params.client),
      projectId: firstSearchParam(params.project),
      todoId: firstSearchParam(params.todo),
      billable: parseEnumParam(params.billable, billableFilters) ?? "all",
      groupBy,
      groupBy2: parseEnumParam(params.then, groupByOptions),
      sort: parseActivitySort(params.sort) ?? defaultActivitySort(groupBy),
      columns: params.columns === undefined ? null : parseColumnList(params.columns),
      page: parsePageParam(params.page),
    },
    rangeError: from > to,
    viewInUrl: reportViewInUrl(params),
  };
}

/** One comma-separated value. A repeated key still uses only its first value. */
export function parseColumnList(value: string | string[] | undefined | null): string[] {
  const first = firstSearchParam(value);
  if (!first) return [];
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const part of first.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    columns.push(id);
  }
  return columns;
}

export function allowedColumns(kind: ReportKind, showMoney: boolean, manager: boolean) {
  if (kind === "work-sessions") {
    const columns = ["start", "end", "duration", "project", "todo", "client", "notes", "billable"];
    if (manager) columns.push("member");
    return columns;
  }
  const columns = ["hours", "billableHours"];
  if (showMoney) columns.push("amount");
  return columns;
}

export function defaultColumns(kind: ReportKind, showMoney: boolean, manager: boolean) {
  return allowedColumns(kind, showMoney, manager);
}

export function resolveColumns(
  kind: ReportKind,
  requested: string[] | null,
  showMoney: boolean,
  manager: boolean,
) {
  const allowed = new Set(allowedColumns(kind, showMoney, manager));
  const source = requested ?? defaultColumns(kind, showMoney, manager);
  const columns = source.filter((id) => allowed.has(id));
  // A member can ask for amount only. That leaves no visible column, so show Hours.
  if (columns.length === 0 && allowed.has("hours")) return ["hours"];
  return columns;
}

export function columnLabel(id: string) {
  if (id === "hours") return reportCopy.hours;
  if (id === "billableHours") return reportCopy.billableHours;
  if (id === "amount") return reportCopy.amount;
  if (id === "start") return reportCopy.start;
  if (id === "end") return reportCopy.end;
  if (id === "duration") return reportCopy.duration;
  if (id === "project") return reportCopy.projectLabel;
  if (id === "todo") return reportCopy.todoColumn;
  if (id === "client") return reportCopy.clientLabel;
  if (id === "notes") return reportCopy.notes;
  if (id === "billable") return reportCopy.billable;
  if (id === "member") return reportCopy.member;
  return id;
}

export function reportPath(kind: ReportKind, mode: "page" | "csv" | "pdf" = "page") {
  return mode === "page" ? `/reports/${kind}` : `/reports/${kind}/export`;
}

export function reportHref(
  kind: ReportKind,
  query: {
    preset?: ReportPreset;
    from?: string;
    to?: string;
    memberId?: string;
    clientId?: string;
    projectId?: string;
    todoId?: string;
    billable?: BillableFilter;
    groupBy?: GroupBy;
    groupBy2?: GroupBy | null;
    sort?: ActivitySort | null;
    columns?: string[] | null;
    page?: number;
  },
  options: { exportCsv?: boolean; exportPdf?: boolean } = {},
) {
  const params = new URLSearchParams();
  const preset = query.preset ?? "this-week";
  if (preset !== "this-week") params.set("preset", preset);
  if (preset === "custom") {
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
  }
  if (query.memberId) params.set("member", query.memberId);
  if (query.clientId) params.set("client", query.clientId);
  if (query.projectId) params.set("project", query.projectId);
  if (query.todoId) params.set("todo", query.todoId);
  if (query.billable && query.billable !== "all") params.set("billable", query.billable);
  if (kind === "time-activity" && query.groupBy) {
    params.set("group", query.groupBy);
    if (query.groupBy2 && query.groupBy2 !== query.groupBy) params.set("then", query.groupBy2);
    if (query.sort) params.set("sort", activitySortToken(query.sort));
  } else if (query.groupBy && query.groupBy !== defaultGroupBy(kind)) {
    params.set("group", query.groupBy);
  }
  if (query.columns) params.set("columns", query.columns.join(","));
  const exporting = Boolean(options.exportCsv || options.exportPdf);
  if (query.page && query.page > 1 && !exporting) params.set("page", String(query.page));
  if (options.exportPdf) params.set("format", "pdf");
  const path = reportPath(kind, options.exportPdf ? "pdf" : options.exportCsv ? "csv" : "page");
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function reportTitle(kind: ReportKind) {
  if (kind === "time-activity") return reportCopy.timeActivityTitle;
  if (kind === "daily") return reportCopy.dailyTitle;
  if (kind === "weekly") return reportCopy.weeklyTitle;
  return reportCopy.sessionsTitle;
}

export function groupByLabel(kind: ReportKind, groupBy: GroupBy) {
  if (kind === "weekly" && groupBy === "date") return reportCopy.week;
  if (groupBy === "member") return reportCopy.groupMember;
  if (groupBy === "client") return reportCopy.groupClient;
  if (groupBy === "project") return reportCopy.groupProject;
  if (groupBy === "todo") return reportCopy.groupTodo;
  return reportCopy.groupDate;
}

export function billableFilterLabel(billable: BillableFilter) {
  if (billable === "billable") return reportCopy.billableOnly;
  if (billable === "non-billable") return reportCopy.billableNone;
  return reportCopy.billableAll;
}

/**
 * Filters the Time & Activity PDF applies. The PDF keeps its own layout, so
 * this line does not mention Group by or the column chooser.
 */
export function describeActivityFilters(input: {
  showMember: boolean;
  memberName: string | null;
  clientName: string | null;
  projectName: string | null;
  todoName?: string | null;
  billable: BillableFilter;
}) {
  const parts: string[] = [];
  if (input.showMember && input.memberName) {
    parts.push(`${reportCopy.memberLabel}: ${input.memberName}`);
  }
  if (input.clientName) parts.push(`${reportCopy.clientLabel}: ${input.clientName}`);
  if (input.projectName) parts.push(`${reportCopy.projectLabel}: ${input.projectName}`);
  if (input.todoName) parts.push(`${reportCopy.todoColumn}: ${input.todoName}`);
  if (input.billable !== "all") {
    parts.push(`${reportCopy.billableLabel}: ${billableFilterLabel(input.billable)}`);
  }
  return parts.join(" · ");
}

/** Header lines for the PDF. Names, not ids. Members do not get a member line. */
export function describeReportFilters(input: {
  kind: ReportKind;
  from: string;
  to: string;
  timeZone: string;
  showMember: boolean;
  memberName: string | null;
  clientName: string | null;
  projectName: string | null;
  todoName?: string | null;
  billable: BillableFilter;
  groupBy: GroupBy;
  groupBy2?: GroupBy | null;
  sortLabel?: string | null;
}) {
  const lines = [
    `${reportCopy.filterDates}: ${formatDayHeading(input.from)} – ${formatDayHeading(input.to)}`,
  ];
  if (input.showMember) {
    lines.push(`${reportCopy.memberLabel}: ${input.memberName ?? reportCopy.allMembers}`);
  }
  lines.push(
    `${reportCopy.clientLabel}: ${input.clientName ?? reportCopy.allClients}`,
    `${reportCopy.projectLabel}: ${input.projectName ?? reportCopy.allProjects}`,
    ...(input.todoName ? [`${reportCopy.todoColumn}: ${input.todoName}`] : []),
    `${reportCopy.billableLabel}: ${billableFilterLabel(input.billable)}`,
    `${reportCopy.groupLabel}: ${groupByLabel(input.kind, input.groupBy)}`,
  );
  if (input.groupBy2 && input.groupBy2 !== input.groupBy) {
    lines.push(`${reportCopy.thenLabel}: ${groupByLabel(input.kind, input.groupBy2)}`);
  }
  if (input.sortLabel) lines.push(`${reportCopy.sortLabel}: ${input.sortLabel}`);
  lines.push(`${reportCopy.timezoneLabel}: ${input.timeZone}`);
  return lines;
}

export function reportDescription(kind: ReportKind, manager = true) {
  if (kind === "time-activity") {
    return manager ? reportCopy.timeActivityBody : reportCopy.timeActivityMemberBody;
  }
  if (kind === "daily") return reportCopy.dailyBody;
  if (kind === "weekly") return reportCopy.weeklyBody;
  return reportCopy.sessionsBody;
}
