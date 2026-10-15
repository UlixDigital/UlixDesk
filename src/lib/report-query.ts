import { reportCopy } from "@/lib/report-copy";
import {
  firstSearchParam,
  parseBoundedDate,
  parseEnumParam,
  parsePageParam,
} from "@/lib/search-params";
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

export const groupByOptions = ["member", "client", "project", "date"] as const;
export type GroupBy = (typeof groupByOptions)[number];

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
  billable: BillableFilter;
  groupBy: GroupBy;
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

export function parseReportSearchParams(params: SearchInput, today: string): {
  query: ReportQuery;
  rangeError: boolean;
} {
  const preset = parseEnumParam(params.preset, reportPresets) ?? "this-week";
  const fallback = rangeForPreset("this-week", today);
  const range = preset === "custom" ? null : rangeForPreset(preset, today);
  const from =
    preset === "custom" ? parseBoundedDate(params.from, fallback.from) : (range?.from ?? fallback.from);
  const to =
    preset === "custom" ? parseBoundedDate(params.to, fallback.to) : (range?.to ?? fallback.to);
  return {
    query: {
      preset,
      from,
      to,
      memberId: firstSearchParam(params.member),
      clientId: firstSearchParam(params.client),
      projectId: firstSearchParam(params.project),
      billable: parseEnumParam(params.billable, billableFilters) ?? "all",
      groupBy: parseEnumParam(params.group, groupByOptions) ?? "project",
      columns: params.columns === undefined ? null : parseColumnList(params.columns),
      page: parsePageParam(params.page),
    },
    rangeError: from > to,
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
    const columns = ["start", "end", "duration", "project", "client", "notes", "billable"];
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
  return source.filter((id) => allowed.has(id));
}

export function columnLabel(id: string) {
  if (id === "hours") return reportCopy.hours;
  if (id === "billableHours") return reportCopy.billableHours;
  if (id === "amount") return reportCopy.amount;
  if (id === "start") return reportCopy.start;
  if (id === "end") return reportCopy.end;
  if (id === "duration") return reportCopy.duration;
  if (id === "project") return reportCopy.projectLabel;
  if (id === "client") return reportCopy.clientLabel;
  if (id === "notes") return reportCopy.notes;
  if (id === "billable") return reportCopy.billable;
  if (id === "member") return reportCopy.member;
  return id;
}

export function reportPath(kind: ReportKind, exportCsv = false) {
  return exportCsv ? `/reports/${kind}/export` : `/reports/${kind}`;
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
    billable?: BillableFilter;
    groupBy?: GroupBy;
    columns?: string[] | null;
    page?: number;
  },
  options: { exportCsv?: boolean } = {},
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
  if (query.billable && query.billable !== "all") params.set("billable", query.billable);
  if (query.groupBy && query.groupBy !== "project") params.set("group", query.groupBy);
  if (query.columns) params.set("columns", query.columns.join(","));
  if (query.page && query.page > 1 && !options.exportCsv) params.set("page", String(query.page));
  const path = reportPath(kind, options.exportCsv);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function reportTitle(kind: ReportKind) {
  if (kind === "time-activity") return reportCopy.timeActivityTitle;
  if (kind === "daily") return reportCopy.dailyTitle;
  if (kind === "weekly") return reportCopy.weeklyTitle;
  return reportCopy.sessionsTitle;
}

export function reportDescription(kind: ReportKind) {
  if (kind === "time-activity") return reportCopy.timeActivityBody;
  if (kind === "daily") return reportCopy.dailyBody;
  if (kind === "weekly") return reportCopy.weeklyBody;
  return reportCopy.sessionsBody;
}
