import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  agingBucket,
  agingBuckets,
  daysPastDue,
  emptyAgingBuckets,
  invoiceBalance,
  isOverdue,
  type AgingBucket,
} from "@/lib/invoice-balance";
import { invoiceCopy, invoiceStatusLabel } from "@/lib/invoice-copy";
import { dateColumn } from "@/lib/invoice-form";
import { invoiceReportCopy } from "@/lib/invoice-report-copy";
import { formatMoney, formatMoneyNumber } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { reportCopy } from "@/lib/report-copy";
import { rangeForPreset, reportPresets, type ReportPreset } from "@/lib/report-query";
import type { PdfTable } from "@/lib/report-pdf";
import { firstSearchParam, parseBoundedDate, parseEnumParam } from "@/lib/search-params";
import { canManageWorkspace } from "@/lib/users-validation";

export const CLIENT_INVOICE_REPORT_CAP = 5000;

export const clientInvoiceParamKeys = ["preset", "from", "to", "client", "status"] as const;
export const agingParamKeys = ["preset", "from", "to", "client"] as const;

export const clientInvoiceStatuses = ["all", "open", "paid"] as const;
export type ClientInvoiceStatusFilter = (typeof clientInvoiceStatuses)[number];

type LooseParams = Record<string, string | string[] | undefined>;

export type ClientInvoiceFilters = {
  preset: ReportPreset;
  from: string;
  to: string;
  clientId: string;
  status: ClientInvoiceStatusFilter;
  rangeError: boolean;
};

export type AgingFilters = {
  preset: ReportPreset;
  from: string;
  to: string;
  asOf: string;
  clientId: string;
  rangeError: boolean;
};

export type ClientInvoiceRow = {
  id: string;
  issueDate: string;
  number: string;
  clientName: string;
  status: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  dueDate: string;
  overdue: boolean;
};

export type CurrencyBalance = {
  currency: string;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
};

export type AgingRow = {
  clientName: string;
  currency: string;
  buckets: Record<AgingBucket, number>;
  totalMinor: number;
};

export type AgingCurrencyTotal = {
  currency: string;
  buckets: Record<AgingBucket, number>;
  totalMinor: number;
};

const bucketLabel: Record<AgingBucket, string> = {
  current: invoiceReportCopy.current,
  d1: invoiceReportCopy.bucket1,
  d31: invoiceReportCopy.bucket31,
  d61: invoiceReportCopy.bucket61,
  d91: invoiceReportCopy.bucket90,
};

export function isInvoiceMoneyReport(reportType: string): reportType is "client-invoices" | "invoice-aging" {
  return reportType === "client-invoices" || reportType === "invoice-aging";
}

function parseReportId(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return "";
  return trimmed;
}

function resolveRange(preset: ReportPreset, params: LooseParams, today: string, fallbackPreset: Exclude<ReportPreset, "custom">) {
  const fallback = rangeForPreset(fallbackPreset, today);
  const range = preset === "custom" ? null : rangeForPreset(preset, today);
  const from = preset === "custom" ? parseBoundedDate(params.from, fallback.from) : (range?.from ?? fallback.from);
  const to = preset === "custom" ? parseBoundedDate(params.to, fallback.to) : (range?.to ?? fallback.to);
  return { from, to, rangeError: from > to };
}

export function parseClientInvoiceFilters(params: LooseParams, today: string): ClientInvoiceFilters {
  const preset = parseEnumParam(params.preset, reportPresets) ?? "this-month";
  const range = resolveRange(preset, params, today, "this-month");
  const status = parseEnumParam(params.status, clientInvoiceStatuses) ?? "all";
  return {
    preset,
    from: range.from,
    to: range.to,
    clientId: parseReportId(firstSearchParam(params.client)),
    status,
    rangeError: range.rangeError,
  };
}

export function parseAgingFilters(params: LooseParams, today: string): AgingFilters {
  const preset = parseEnumParam(params.preset, reportPresets) ?? "today";
  const range = resolveRange(preset, params, today, "today");
  return {
    preset,
    from: range.from,
    to: range.to,
    asOf: range.to,
    clientId: parseReportId(firstSearchParam(params.client)),
    rangeError: range.rangeError,
  };
}

export function storedClientInvoiceParams(input: Record<string, string>, today: string) {
  const parsed = parseClientInvoiceFilters(input, today);
  const params: Record<string, string> = {};
  if (parsed.preset !== "this-month") params.preset = parsed.preset;
  if (parsed.preset === "custom") {
    params.from = parsed.from;
    params.to = parsed.to;
  }
  if (parsed.clientId) params.client = parsed.clientId;
  if (parsed.status !== "all") params.status = parsed.status;
  return params;
}

export function storedAgingParams(input: Record<string, string>, today: string) {
  const parsed = parseAgingFilters(input, today);
  const params: Record<string, string> = {};
  if (parsed.preset !== "today") params.preset = parsed.preset;
  if (parsed.preset === "custom") {
    params.from = parsed.from;
    params.to = parsed.to;
  }
  if (parsed.clientId) params.client = parsed.clientId;
  return params;
}

export function invoiceReportSearch(filters: {
  preset: ReportPreset;
  from: string;
  to: string;
  clientId: string;
  status?: ClientInvoiceStatusFilter;
}) {
  const search = new URLSearchParams();
  search.set("preset", filters.preset);
  if (filters.preset === "custom") {
    search.set("from", filters.from);
    search.set("to", filters.to);
  }
  if (filters.clientId) search.set("client", filters.clientId);
  if (filters.status && filters.status !== "all") search.set("status", filters.status);
  return search.toString();
}

function dateKey(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function addBalance(totals: Map<string, CurrencyBalance>, row: ClientInvoiceRow) {
  const current = totals.get(row.currency) ?? {
    currency: row.currency,
    totalMinor: 0,
    paidMinor: 0,
    dueMinor: 0,
  };
  current.totalMinor += row.totalMinor;
  current.paidMinor += row.paidMinor;
  current.dueMinor += row.dueMinor;
  totals.set(row.currency, current);
}

export async function loadClientInvoiceReport(input: {
  actor: { id: string; role: string };
  params: LooseParams;
  today: string;
}) {
  if (!canManageWorkspace(input.actor.role)) {
    return { ok: false as const, failure: "denied" as const };
  }
  const filters = parseClientInvoiceFilters(input.params, input.today);
  if (filters.rangeError) return { ok: false as const, failure: "range" as const, filters };
  const statuses = filters.status === "all" ? ["open", "paid"] : [filters.status];
  const where = {
    status: { in: statuses },
    issueDate: { gte: dateColumn(filters.from), lte: dateColumn(filters.to) },
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
  };
  const count = await prisma.invoice.count({ where });
  if (count > CLIENT_INVOICE_REPORT_CAP) {
    return { ok: false as const, failure: "large" as const, filters };
  }
  const found = await prisma.invoice.findMany({
    where,
    include: { client: { select: { name: true } } },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
  });
  const rows: ClientInvoiceRow[] = found.map((invoice) => {
    const balance = invoiceBalance(invoice.totalMinor, invoice.paidMinor);
    const dueDate = dateKey(invoice.dueDate);
    return {
      id: invoice.id,
      issueDate: dateKey(invoice.issueDate),
      number: invoice.number,
      clientName: invoice.client.name,
      status: invoice.status,
      currency: invoice.currency,
      totalMinor: balance.totalMinor,
      paidMinor: balance.paidMinor,
      dueMinor: balance.dueMinor,
      dueDate,
      overdue: isOverdue({ dueDate, today: input.today, dueMinor: balance.dueMinor }),
    };
  });
  const totals = new Map<string, CurrencyBalance>();
  for (const row of rows) addBalance(totals, row);
  return {
    ok: true as const,
    filters,
    rows,
    totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    filtered: Boolean(filters.clientId || filters.status !== "all"),
  };
}

type AgingSqlRow = {
  clientId: string;
  clientName: string;
  currency: string;
  dueDate: Date | string;
  totalMinor: number | string;
  paidMinor: number | string;
};

export async function loadAgingReport(input: {
  actor: { id: string; role: string };
  params: LooseParams;
  today: string;
}) {
  if (!canManageWorkspace(input.actor.role)) {
    return { ok: false as const, failure: "denied" as const };
  }
  const filters = parseAgingFilters(input.params, input.today);
  if (filters.rangeError) return { ok: false as const, failure: "range" as const, filters };
  const asOf = dateColumn(filters.asOf);
  const clientClause = filters.clientId ? Prisma.sql`AND i."clientId" = ${filters.clientId}` : Prisma.empty;
  const found = await prisma.$queryRaw<AgingSqlRow[]>`
    SELECT i."clientId" AS "clientId",
           c."name" AS "clientName",
           i."currency" AS "currency",
           i."dueDate" AS "dueDate",
           i."totalMinor" AS "totalMinor",
           i."paidMinor" AS "paidMinor"
    FROM "Invoice" i
    JOIN "Client" c ON c."id" = i."clientId"
    WHERE i."status" NOT IN ('draft', 'void')
      AND i."paidMinor" < i."totalMinor"
      AND i."issueDate" <= ${asOf}
      ${clientClause}
    ORDER BY c."name" ASC, i."currency" ASC, i."number" ASC
    LIMIT ${CLIENT_INVOICE_REPORT_CAP + 1}
  `;
  if (found.length > CLIENT_INVOICE_REPORT_CAP) {
    return { ok: false as const, failure: "large" as const, filters };
  }
  const grouped = new Map<string, AgingRow>();
  for (const invoice of found) {
    const balance = invoiceBalance(Number(invoice.totalMinor), Number(invoice.paidMinor));
    if (balance.dueMinor <= 0) continue;
    const key = `${invoice.clientId}\u0000${invoice.currency}`;
    const row = grouped.get(key) ?? {
      clientName: invoice.clientName,
      currency: invoice.currency,
      buckets: emptyAgingBuckets(),
      totalMinor: 0,
    };
    const bucket = agingBucket(daysPastDue(dateKey(invoice.dueDate), filters.asOf));
    row.buckets[bucket] += balance.dueMinor;
    row.totalMinor += balance.dueMinor;
    grouped.set(key, row);
  }
  const rows = [...grouped.values()].sort(
    (a, b) => a.clientName.localeCompare(b.clientName, "en") || a.currency.localeCompare(b.currency),
  );
  const totals = new Map<string, AgingCurrencyTotal>();
  for (const row of rows) {
    const total = totals.get(row.currency) ?? {
      currency: row.currency,
      buckets: emptyAgingBuckets(),
      totalMinor: 0,
    };
    for (const bucket of agingBuckets) total.buckets[bucket] += row.buckets[bucket];
    total.totalMinor += row.totalMinor;
    totals.set(row.currency, total);
  }
  return {
    ok: true as const,
    filters,
    rows,
    totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    filtered: Boolean(filters.clientId),
  };
}

function moneyCell(amountMinor: number, currency: string) {
  return formatMoneyNumber(amountMinor, currency);
}

export function clientInvoicesToCsv(rows: ClientInvoiceRow[], totals: CurrencyBalance[]) {
  const header = [
    invoiceReportCopy.issueDate,
    invoiceReportCopy.number,
    invoiceCopy.client,
    invoiceCopy.status,
    invoiceReportCopy.currency,
    invoiceCopy.total,
    invoiceCopy.paid,
    invoiceCopy.amountDue,
    invoiceReportCopy.dueDate,
    invoiceReportCopy.overdue,
  ];
  const body = rows.map((row) => [
    row.issueDate,
    row.number,
    row.clientName,
    invoiceStatusLabel(row.status),
    row.currency,
    moneyCell(row.totalMinor, row.currency),
    moneyCell(row.paidMinor, row.currency),
    moneyCell(row.dueMinor, row.currency),
    row.dueDate,
    row.overdue ? invoiceReportCopy.overdueYes : invoiceReportCopy.overdueNo,
  ]);
  const totalRows = totals.map((total) => [
    "",
    "",
    reportCopy.total,
    "",
    total.currency,
    moneyCell(total.totalMinor, total.currency),
    moneyCell(total.paidMinor, total.currency),
    moneyCell(total.dueMinor, total.currency),
    "",
    "",
  ]);
  return toCsv([header, ...body, ...totalRows]);
}

export function agingToCsv(rows: AgingRow[], totals: AgingCurrencyTotal[]) {
  const header = [
    invoiceCopy.client,
    invoiceReportCopy.currency,
    ...agingBuckets.map((bucket) => bucketLabel[bucket]),
    invoiceCopy.total,
  ];
  const line = (name: string, currency: string, buckets: Record<AgingBucket, number>, totalMinor: number) => [
    name,
    currency,
    ...agingBuckets.map((bucket) => moneyCell(buckets[bucket], currency)),
    moneyCell(totalMinor, currency),
  ];
  const body = rows.map((row) => line(row.clientName, row.currency, row.buckets, row.totalMinor));
  const totalRows = totals.map((total) =>
    line(`${reportCopy.total} (${total.currency})`, total.currency, total.buckets, total.totalMinor),
  );
  return toCsv([header, ...body, ...totalRows]);
}

export function clientInvoicesToTable(rows: ClientInvoiceRow[], totals: CurrencyBalance[]): PdfTable {
  const columns = [
    { label: invoiceReportCopy.issueDate, align: "left" as const },
    { label: invoiceReportCopy.number, align: "left" as const },
    { label: invoiceCopy.client, align: "left" as const },
    { label: invoiceCopy.status, align: "left" as const },
    { label: invoiceReportCopy.currency, align: "left" as const },
    { label: invoiceCopy.total, align: "right" as const },
    { label: invoiceCopy.paid, align: "right" as const },
    { label: invoiceCopy.amountDue, align: "right" as const },
    { label: invoiceReportCopy.dueDate, align: "left" as const },
    { label: invoiceReportCopy.overdue, align: "left" as const },
  ];
  const body = rows.map((row) => [
    row.issueDate,
    row.number,
    row.clientName,
    invoiceStatusLabel(row.status),
    row.currency,
    formatMoney(row.totalMinor, row.currency),
    formatMoney(row.paidMinor, row.currency),
    formatMoney(row.dueMinor, row.currency),
    row.dueDate,
    row.overdue ? invoiceReportCopy.overdueYes : invoiceReportCopy.overdueNo,
  ]);
  const totalRows = totals.map((total) => [
    "",
    "",
    `${reportCopy.total} (${total.currency})`,
    "",
    total.currency,
    formatMoney(total.totalMinor, total.currency),
    formatMoney(total.paidMinor, total.currency),
    formatMoney(total.dueMinor, total.currency),
    "",
    "",
  ]);
  return { columns, rows: [...body, ...totalRows], totals: null };
}

export function agingToTable(rows: AgingRow[], totals: AgingCurrencyTotal[]): PdfTable {
  const columns = [
    { label: invoiceCopy.client, align: "left" as const },
    { label: invoiceReportCopy.currency, align: "left" as const },
    ...agingBuckets.map((bucket) => ({ label: bucketLabel[bucket], align: "right" as const })),
    { label: invoiceCopy.total, align: "right" as const },
  ];
  const line = (name: string, currency: string, buckets: Record<AgingBucket, number>, totalMinor: number) => [
    name,
    currency,
    ...agingBuckets.map((bucket) => formatMoney(buckets[bucket], currency)),
    formatMoney(totalMinor, currency),
  ];
  return {
    columns,
    rows: [
      ...rows.map((row) => line(row.clientName, row.currency, row.buckets, row.totalMinor)),
      ...totals.map((total) =>
        line(`${reportCopy.total} (${total.currency})`, total.currency, total.buckets, total.totalMinor),
      ),
    ],
    totals: null,
  };
}

export function agingBucketLabels() {
  return bucketLabel;
}
