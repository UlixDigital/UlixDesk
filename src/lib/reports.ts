import type { Prisma } from "@prisma/client";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatMoney, formatMoneyNumber, sumMoney, type MoneyTotal } from "@/lib/money";
import { amountColumnLabel, reportCopy } from "@/lib/report-copy";
import {
  REPORT_PAGE_SIZE,
  REPORT_ROW_CAP,
  type BillableFilter,
  type GroupBy,
  type ReportKind,
} from "@/lib/report-query";
import { listAllBillRates } from "@/lib/bill-rates";
import { rateCopy } from "@/lib/rate-copy";
import {
  attachRates,
  portionAmount,
  portionIsUnrated,
  type ResolvedRate,
} from "@/lib/rates";
import { decimalHours, formatTrackedDuration, formatDayHeading, formatWeekHeading } from "@/lib/timesheet";
import { formatChangeWhen } from "@/lib/time-change-display";
import {
  startOfWeekDate,
  zonedDayEnd,
  zonedParts,
} from "@/lib/time-zone";
import { canManageWorkspace, canSeeMoney } from "@/lib/users-validation";

export type SourceEntry = {
  id: string;
  userId: string | null;
  userName: string;
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  startedAt: Date;
  endedAt: Date;
  billable: boolean;
  projectBillable: boolean;
  note: string | null;
  rate: ResolvedRate | null;
  /** manual or timer. Omitted on older fixtures; treated as timer. */
  source?: "manual" | "timer";
  /** True when a time-change row records an edit of this entry. */
  edited?: boolean;
};

export type ReportSlice = {
  entryId: string;
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  startedAt: Date;
  endedAt: Date;
  note: string;
  source: "manual" | "timer";
  edited: boolean;
  date: string;
  weekStart: string;
  durationMs: number;
  billableMs: number;
  amount: MoneyTotal | null;
  unrated: boolean;
};

export type ReportColumn = { id: string; label: string };

export type ReportCsv = {
  columns: ReportColumn[];
  rows: string[][];
  totals: string[] | null;
};

export type BuiltReport = {
  columns: ReportColumn[];
  rows: Array<{ id: string; cells: Record<string, string> }>;
  totals: Record<string, string> | null;
  /** Numeric hours and amounts. The screen keeps the formatted cells. */
  csv: ReportCsv;
  totalRows: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

type Agg = {
  key: string;
  bucketId: string;
  bucketLabel: string;
  groupId: string;
  groupLabel: string;
  durationMs: number;
  billableMs: number;
  amounts: MoneyTotal[];
  unrated: boolean;
  sort: string;
};

function named(entry: SourceEntry): Omit<ReportSlice, "date" | "weekStart" | "durationMs" | "billableMs" | "amount" | "unrated"> {
  return {
    entryId: entry.id,
    userId: entry.userId ?? "",
    userName: entry.userName.trim() || reportCopy.unassigned,
    projectId: entry.projectId,
    projectName: entry.projectName,
    clientId: entry.clientId ?? "",
    clientName: entry.clientName?.trim() || reportCopy.noClient,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    note: entry.note ?? "",
    source: entry.source === "manual" ? "manual" : "timer",
    edited: entry.edited === true,
  };
}

/** Split an entry on workspace midnights, counting only the overlap with the range. */
export function slicesForEntry(
  entry: SourceEntry,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string,
): ReportSlice[] {
  const slices: ReportSlice[] = [];
  let cursor = Math.max(entry.startedAt.getTime(), rangeStart.getTime());
  const end = Math.min(entry.endedAt.getTime(), rangeEnd.getTime());
  const base = named(entry);
  while (cursor < end) {
    const date = zonedParts(new Date(cursor), timeZone).date;
    const dayEnd = zonedDayEnd(date, timeZone).getTime();
    if (dayEnd <= cursor) break;
    const sliceEnd = Math.min(dayEnd, end);
    const durationMs = sliceEnd - cursor;
    const portion = {
      projectBillable: entry.projectBillable,
      entryBillable: entry.billable,
      durationMs,
      rate: entry.rate,
    };
    const effective = entry.billable && entry.projectBillable;
    slices.push({
      ...base,
      date,
      weekStart: startOfWeekDate(date),
      durationMs,
      billableMs: effective ? durationMs : 0,
      amount: portionAmount(portion),
      unrated: portionIsUnrated(portion),
    });
    cursor = sliceEnd;
  }
  return slices;
}

function groupOf(slice: ReportSlice, groupBy: GroupBy, kind: ReportKind) {
  if (kind === "weekly" && groupBy === "date") {
    return { id: slice.weekStart, label: formatWeekHeading(slice.weekStart) };
  }
  if (groupBy === "member") return { id: slice.userId || "none", label: slice.userName };
  if (groupBy === "client") return { id: slice.clientId || "none", label: slice.clientName };
  if (groupBy === "project") return { id: slice.projectId, label: slice.projectName };
  return { id: slice.date, label: formatDayHeading(slice.date) };
}

function bucketOf(slice: ReportSlice, groupBy: GroupBy, kind: ReportKind) {
  if (kind === "daily" && groupBy !== "date") {
    return { id: slice.date, label: formatDayHeading(slice.date) };
  }
  if (kind === "weekly" && groupBy !== "date") {
    return { id: slice.weekStart, label: formatWeekHeading(slice.weekStart) };
  }
  return null;
}

function groupHeading(groupBy: GroupBy, kind: ReportKind) {
  if (kind === "weekly" && groupBy === "date") return reportCopy.week;
  if (groupBy === "member") return reportCopy.member;
  if (groupBy === "client") return reportCopy.clientLabel;
  if (groupBy === "project") return reportCopy.projectLabel;
  return reportCopy.date;
}

function amountText(amounts: MoneyTotal[], currency: string) {
  const match = amounts.find((amount) => amount.currency === currency);
  return match ? formatMoney(match.amountMinor, match.currency) : "";
}

/** Dates sort on the calendar. Names sort alphabetically. */
function groupSort(group: { id: string; label: string }) {
  return /^\d{4}-\d{2}-\d{2}$/.test(group.id) ? group.id : group.label.toLocaleLowerCase("en");
}

function aggregate(slices: ReportSlice[], kind: ReportKind, groupBy: GroupBy): Agg[] {
  const grouped = new Map<string, Agg>();
  for (const slice of slices) {
    const group = groupOf(slice, groupBy, kind);
    const bucket = bucketOf(slice, groupBy, kind);
    const key = `${bucket?.id ?? ""}\t${group.id}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        bucketId: bucket?.id ?? "",
        bucketLabel: bucket?.label ?? "",
        groupId: group.id,
        groupLabel: group.label,
        durationMs: slice.durationMs,
        billableMs: slice.billableMs,
        amounts: slice.amount ? [slice.amount] : [],
        unrated: slice.unrated,
        sort: `${bucket?.id ?? ""}\t${groupSort(group)}\t${group.id}`,
      });
      continue;
    }
    existing.durationMs += slice.durationMs;
    existing.billableMs += slice.billableMs;
    existing.amounts = sumMoney([...existing.amounts, slice.amount]);
    existing.unrated = existing.unrated || slice.unrated;
  }
  return [...grouped.values()].sort((a, b) => a.sort.localeCompare(b.sort, "en"));
}

function moneyColumns(rows: Array<{ amounts: MoneyTotal[]; unrated: boolean }>, showAmount: boolean) {
  if (!showAmount) return [] as ReportColumn[];
  const currencies = new Set<string>();
  let unrated = false;
  for (const row of rows) {
    for (const amount of row.amounts) currencies.add(amount.currency);
    if (row.unrated) unrated = true;
  }
  const columns: ReportColumn[] = [...currencies]
    .sort((a, b) => a.localeCompare(b))
    .map((currency) => ({ id: `amount:${currency}`, label: amountColumnLabel(currency) }));
  if (unrated) columns.push({ id: "noAmount", label: reportCopy.noAmount });
  if (columns.length === 0) columns.push({ id: "amount", label: reportCopy.amount });
  return columns;
}

function summaryCells(
  row: { durationMs: number; billableMs: number; amounts: MoneyTotal[]; unrated: boolean },
  columns: ReportColumn[],
) {
  const cells: Record<string, string> = {};
  for (const column of columns) {
    if (column.id === "hours") cells.hours = formatTrackedDuration(row.durationMs);
    else if (column.id === "billableHours") cells.billableHours = formatTrackedDuration(row.billableMs);
    else if (column.id.startsWith("amount:")) {
      cells[column.id] = amountText(row.amounts, column.id.slice("amount:".length));
    } else if (column.id === "noAmount") cells.noAmount = row.unrated ? reportCopy.noAmount : "";
    else if (column.id === "amount") cells.amount = row.unrated ? reportCopy.noAmount : "";
  }
  return cells;
}

function sessionBillable(entry: SourceEntry) {
  return entry.billable && entry.projectBillable ? rateCopy.billablePrefix : rateCopy.nonBillable;
}

export function buildReport(input: {
  kind: ReportKind;
  entries: SourceEntry[];
  rangeStart: Date;
  rangeEnd: Date;
  timeZone: string;
  groupBy: GroupBy;
  columns: string[];
  showMoney: boolean;
  manager: boolean;
  page?: number;
  /** When set, work sessions return every row instead of one page. CSV uses this. */
  allRows?: boolean;
}): BuiltReport {
  const selected = new Set(input.columns);
  const showAmount = input.showMoney && selected.has("amount");
  if (input.kind === "work-sessions") {
    return buildSessions(input, selected);
  }
  const slices = input.entries.flatMap((entry) =>
    slicesForEntry(entry, input.rangeStart, input.rangeEnd, input.timeZone),
  );
  const aggs = aggregate(slices, input.kind, input.groupBy);
  const columns: ReportColumn[] = [];
  const bucket = aggs.some((row) => row.bucketId);
  if (bucket) {
    columns.push({
      id: "bucket",
      label: input.kind === "weekly" ? reportCopy.week : reportCopy.date,
    });
  }
  columns.push({ id: "group", label: groupHeading(input.groupBy, input.kind) });
  if (selected.has("hours")) columns.push({ id: "hours", label: reportCopy.hours });
  if (selected.has("billableHours")) {
    columns.push({ id: "billableHours", label: reportCopy.billableHours });
  }
  columns.push(...moneyColumns(aggs, showAmount));
  const rows = aggs.map((row) => ({
    id: row.key,
    cells: {
      ...(bucket ? { bucket: row.bucketLabel } : {}),
      group: row.groupLabel,
      ...summaryCells(row, columns),
    },
  }));
  const totalsSource = {
    durationMs: aggs.reduce((sum, row) => sum + row.durationMs, 0),
    billableMs: aggs.reduce((sum, row) => sum + row.billableMs, 0),
    amounts: sumMoney(aggs.flatMap((row) => row.amounts)),
    unrated: aggs.some((row) => row.unrated),
  };
  const totals =
    rows.length === 0
      ? null
      : {
          ...summaryCells(totalsSource, columns),
          ...(bucket ? { bucket: reportCopy.total, group: "" } : { group: reportCopy.total }),
        };
  const csvColumns = summaryCsvColumns(columns);
  const csv = {
    columns: csvColumns,
    rows: aggs.map((row, index) => summaryCsvLine(row, rows[index]?.cells ?? {}, csvColumns)),
    totals: rows.length === 0 ? null : summaryCsvLine(totalsSource, totals ?? {}, csvColumns, true),
  };
  return {
    columns,
    rows,
    totals,
    csv,
    totalRows: rows.length,
    page: 1,
    pageCount: 1,
    pageSize: Math.max(rows.length, 1),
  };
}

function summaryCsvColumns(columns: ReportColumn[]): ReportColumn[] {
  const kept = columns
    .filter((column) => column.id !== "noAmount" && column.id !== "amount")
    .map((column) => ({
      id: column.id,
      label:
        column.id === "hours"
          ? reportCopy.hoursDecimal
          : column.id === "billableHours"
            ? reportCopy.billableHoursDecimal
            : column.label,
    }));
  return [...kept, { id: "status", label: reportCopy.status }];
}

function summaryCsvLine(
  row: { durationMs: number; billableMs: number; amounts: MoneyTotal[]; unrated: boolean },
  cells: Record<string, string>,
  columns: ReportColumn[],
  totals = false,
) {
  return columns.map((column) => {
    if (column.id === "hours") return decimalHours(row.durationMs);
    if (column.id === "billableHours") return decimalHours(row.billableMs);
    if (column.id.startsWith("amount:")) {
      return amountNumber(row.amounts, column.id.slice("amount:".length));
    }
    if (column.id === "status") return totals ? "" : rowStatus(row);
    return cells[column.id] ?? "";
  });
}

function amountNumber(amounts: MoneyTotal[], currency: string) {
  const match = amounts.find((amount) => amount.currency === currency);
  return match ? formatMoneyNumber(match.amountMinor, match.currency) : "";
}

function rowStatus(row: { durationMs: number; billableMs: number; unrated: boolean }) {
  if (row.unrated) return reportCopy.statusNoRate;
  if (row.durationMs > 0 && row.billableMs === 0) return reportCopy.statusNonBillable;
  if (row.billableMs > 0) return reportCopy.statusBillable;
  return "";
}

function buildSessions(
  input: {
    entries: SourceEntry[];
    timeZone: string;
    groupBy: GroupBy;
    manager: boolean;
    page?: number;
    allRows?: boolean;
  },
  selected: Set<string>,
): BuiltReport {
  const columns: ReportColumn[] = [];
  const order = ["member", "start", "end", "duration", "project", "client", "notes", "billable"];
  for (const id of order) {
    if (!selected.has(id)) continue;
    if (id === "member" && !input.manager) continue;
    columns.push({
      id,
      label:
        id === "start"
          ? reportCopy.start
          : id === "end"
            ? reportCopy.end
            : id === "duration"
              ? reportCopy.duration
              : id === "project"
                ? reportCopy.projectLabel
                : id === "client"
                  ? reportCopy.clientLabel
                  : id === "notes"
                    ? reportCopy.notes
                    : id === "billable"
                      ? reportCopy.billable
                      : reportCopy.member,
    });
  }
  const sorted = [...input.entries].sort((a, b) => {
    const aSlice = sessionSortKey(a, input.groupBy, input.timeZone);
    const bSlice = sessionSortKey(b, input.groupBy, input.timeZone);
    const byGroup = aSlice.localeCompare(bSlice, "en");
    if (byGroup !== 0) return byGroup;
    const byTime = a.startedAt.getTime() - b.startedAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
  const pageSize = input.allRows ? Math.max(sorted.length, 1) : REPORT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(input.page ?? 1, 1), pageCount);
  const visible = input.allRows ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);
  const rows = visible.map((entry) => {
    const name = named(entry);
    const cells: Record<string, string> = {};
    if (selected.has("member") && input.manager) cells.member = name.userName;
    if (selected.has("start")) cells.start = formatChangeWhen(entry.startedAt, input.timeZone);
    if (selected.has("end")) cells.end = formatChangeWhen(entry.endedAt, input.timeZone);
    if (selected.has("duration")) {
      cells.duration = formatTrackedDuration(entry.endedAt.getTime() - entry.startedAt.getTime());
    }
    if (selected.has("project")) cells.project = name.projectName;
    if (selected.has("client")) cells.client = name.clientName;
    if (selected.has("notes")) cells.notes = name.note === "" ? "—" : name.note;
    if (selected.has("billable")) cells.billable = sessionBillable(entry);
    return { id: entry.id, cells };
  });
  const csvColumns = columns.map((column) =>
    column.id === "duration" ? { id: column.id, label: reportCopy.durationDecimal } : column,
  );
  const csvRows = visible.map((entry) => {
    const name = named(entry);
    return csvColumns.map((column) => {
      if (column.id === "member") return name.userName;
      if (column.id === "start") return formatChangeWhen(entry.startedAt, input.timeZone);
      if (column.id === "end") return formatChangeWhen(entry.endedAt, input.timeZone);
      if (column.id === "duration") {
        return decimalHours(entry.endedAt.getTime() - entry.startedAt.getTime());
      }
      if (column.id === "project") return name.projectName;
      if (column.id === "client") return name.clientName;
      if (column.id === "notes") return entry.note ?? "";
      if (column.id === "billable") return sessionBillable(entry);
      return "";
    });
  });
  return {
    columns,
    rows,
    totals: null,
    csv: { columns: csvColumns, rows: csvRows, totals: null },
    totalRows: sorted.length,
    page,
    pageCount,
    pageSize,
  };
}

function sessionSortKey(entry: SourceEntry, groupBy: GroupBy, timeZone: string) {
  const name = named(entry);
  const date = zonedParts(entry.startedAt, timeZone).date;
  if (groupBy === "member") return name.userName;
  if (groupBy === "client") return name.clientName;
  if (groupBy === "project") return name.projectName;
  return date;
}

export function reportToCsv(report: BuiltReport) {
  const header = report.csv.columns.map((column) => column.label);
  const totals = report.csv.totals ? [report.csv.totals] : [];
  return toCsv([header, ...report.csv.rows, ...totals]);
}

export type LoadedReport =
  | { ok: false; code: "REPORT_TOO_LARGE" }
  | {
      ok: true;
      entries: SourceEntry[];
      showMoney: boolean;
      manager: boolean;
      memberId: string | null;
    };

function reportWhere(input: {
  from: Date;
  to: Date;
  userId: string | null;
  clientId: string | null;
  projectId: string | null;
  billable: BillableFilter;
}): Prisma.TimeEntryWhereInput {
  const and: Prisma.TimeEntryWhereInput[] = [
    { endedAt: { not: null, gt: input.from } },
    { startedAt: { lt: input.to } },
  ];
  if (input.userId) and.push({ userId: input.userId });
  if (input.projectId) and.push({ projectId: input.projectId });
  if (input.clientId) and.push({ project: { clientId: input.clientId } });
  if (input.billable === "billable") {
    and.push({ billable: true, project: { billable: true } });
  }
  if (input.billable === "non-billable") {
    and.push({ OR: [{ billable: false }, { project: { billable: false } }] });
  }
  return { AND: and };
}

/** Owners and admins may filter by member. Everyone else is limited to their own entries. */
export function scopedReportUserId(
  actor: { id: string; role: string },
  requestedMemberId: string | null,
) {
  if (!canManageWorkspace(actor.role)) return actor.id;
  return requestedMemberId;
}

export async function loadReportEntries(input: {
  actor: { id: string; role: string };
  from: Date;
  to: Date;
  memberId: string | null;
  clientId: string | null;
  projectId: string | null;
  billable: BillableFilter;
  timeZone: string;
}): Promise<LoadedReport> {
  const manager = canManageWorkspace(input.actor.role);
  const showMoney = canSeeMoney(input.actor.role);
  const userId = scopedReportUserId(input.actor, input.memberId);
  const where = reportWhere({
    from: input.from,
    to: input.to,
    userId,
    clientId: input.clientId,
    projectId: input.projectId,
    billable: input.billable,
  });
  const total = await prisma.timeEntry.count({ where });
  if (total > REPORT_ROW_CAP) return { ok: false, code: "REPORT_TOO_LARGE" };
  const rows = await prisma.timeEntry.findMany({
    where,
    include: {
      user: { select: { name: true } },
      project: {
        select: {
          name: true,
          billable: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
  });
  const ids = rows.map((row) => row.id);
  const editedRows =
    ids.length === 0
      ? []
      : await prisma.timeChange.findMany({
          where: { timeEntryId: { in: ids }, action: "edited" },
          select: { timeEntryId: true },
          distinct: ["timeEntryId"],
        });
  const editedIds = new Set(editedRows.map((row) => row.timeEntryId));
  const source: SourceEntry[] = rows.flatMap((row) => {
    if (!row.endedAt) return [];
    return [
      {
        id: row.id,
        userId: row.userId,
        userName: row.user?.name ?? reportCopy.unassigned,
        projectId: row.projectId,
        projectName: row.project.name,
        clientId: row.project.client?.id ?? null,
        clientName: row.project.client?.name ?? null,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        billable: row.billable,
        projectBillable: row.project.billable,
        note: row.note,
        rate: null,
        source: row.source === "manual" ? "manual" : "timer",
        edited: editedIds.has(row.id),
      },
    ];
  });
  const rates = showMoney ? await listAllBillRates() : [];
  const priced = attachRates(input.actor.role, source, rates, input.timeZone);
  return {
    ok: true,
    entries: priced,
    showMoney,
    manager,
    memberId: userId,
  };
}
