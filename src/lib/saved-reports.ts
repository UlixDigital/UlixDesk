import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/db";
import { savedReportCodes, reportCopy } from "@/lib/report-copy";
import {
  defaultColumns,
  defaultGroupBy,
  parseReportSearchParams,
  resolveColumns,
  reportTitle,
  type GroupBy,
  type ReportKind,
  type ReportQuery,
} from "@/lib/report-query";
import { firstSearchParam, parseBoundedDate, parseEnumParam } from "@/lib/search-params";
import {
  changeActionFilters,
  timeChangeCopy,
  type ChangeActionFilter,
} from "@/lib/time-change-copy";
import { canManageWorkspace } from "@/lib/users-validation";

export const SAVED_REPORT_NAME_MAX = 80;

export const savedReportTypes = [
  "time-activity",
  "daily",
  "weekly",
  "work-sessions",
  "manual-time-edits",
] as const;

export type SavedReportType = (typeof savedReportTypes)[number];
export type SavedVisibility = "private" | "shared";

/** Canonical query params. Only strings, only known keys, already parsed. */
export type StoredParams = Record<string, string>;

const reportParamKeys = [
  "preset",
  "from",
  "to",
  "member",
  "client",
  "project",
  "billable",
  "group",
  "columns",
] as const;

const timeEditParamKeys = ["from", "to", "member", "client", "project", "action"] as const;

export function isSavedReportType(value: string): value is SavedReportType {
  return (savedReportTypes as readonly string[]).includes(value);
}

export function savedReportTitle(reportType: SavedReportType) {
  if (reportType === "manual-time-edits") return timeChangeCopy.pageTitle;
  return reportTitle(reportType);
}

/**
 * Delete rule: the creator can always delete. An owner or admin can also
 * delete a shared report. A private report can only be deleted by its creator.
 * Rename uses the same rule so a shared report can be retitled by an owner
 * or admin.
 */
export function canChangeSavedReport(
  actor: { id: string; role: string },
  report: { createdById: string; visibility: string },
) {
  if (report.createdById === actor.id) return true;
  return report.visibility === "shared" && canManageWorkspace(actor.role);
}

export function canReadSavedReport(
  actor: { id: string; role: string },
  report: { createdById: string; visibility: string },
) {
  if (report.createdById === actor.id) return true;
  return report.visibility === "shared";
}

/** Format and invisible characters. A name made only of these is empty. */
const INVISIBLE_NAME = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;
/** Combining marks (Mn, Mc, Me). A name made only of these is empty. */
const COMBINING_MARK = /\p{M}/gu;

export function parseSavedReportName(raw: string):
  | { ok: true; name: string }
  | { ok: false; code: "SAVED_REPORT_NAME" | "SAVED_REPORT_NAME_LONG"; error: string } {
  const name = raw.replace(INVISIBLE_NAME, "").replace(/\s+/g, " ").trim();
  if (!name.replace(COMBINING_MARK, "").trim()) {
    return { ok: false, code: savedReportCodes.SAVED_REPORT_NAME, error: reportCopy.nameRequired };
  }
  if (name.length > SAVED_REPORT_NAME_MAX) {
    return {
      ok: false,
      code: savedReportCodes.SAVED_REPORT_NAME_LONG,
      error: reportCopy.nameTooLong,
    };
  }
  return { ok: true, name };
}

export function parseSavedVisibility(
  raw: string,
  role: string,
): { ok: true; visibility: SavedVisibility } | { ok: false; code: "SAVED_REPORT_SHARE"; error: string } {
  if (raw === "shared") {
    if (!canManageWorkspace(role)) {
      return { ok: false, code: savedReportCodes.SAVED_REPORT_SHARE, error: reportCopy.cannotShare };
    }
    return { ok: true, visibility: "shared" };
  }
  return { ok: true, visibility: "private" };
}

function ownString(raw: object, key: string) {
  if (!Object.hasOwn(raw, key)) return undefined;
  return (raw as Record<string, unknown>)[key];
}

/** Ids are single tokens. Anything else is dropped rather than stored. */
function parseId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 64 || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return "";
  return trimmed;
}

/**
 * Accept a plain object of strings (a form or a JSON column). Arrays, numbers,
 * and unknown keys are refused or dropped. Dates, enums, and column lists go
 * through the same parsers as the report URL.
 */
export function parseStoredReportParams(
  reportType: string,
  raw: unknown,
  today: string,
): { ok: true; reportType: SavedReportType; params: StoredParams } | { ok: false; code: "SAVED_REPORT_TYPE" | "SAVED_REPORT_PARAMS" } {
  if (!isSavedReportType(reportType)) return { ok: false, code: savedReportCodes.SAVED_REPORT_TYPE };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: savedReportCodes.SAVED_REPORT_PARAMS };
  }
  const keys = reportType === "manual-time-edits" ? timeEditParamKeys : reportParamKeys;
  const input: Record<string, string> = {};
  for (const key of keys) {
    const value = ownString(raw, key);
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false, code: savedReportCodes.SAVED_REPORT_PARAMS };
    input[key] = value;
  }
  if (reportType === "manual-time-edits") {
    return { ok: true, reportType, params: canonicalizeTimeEdits(input, today) };
  }
  return { ok: true, reportType, params: canonicalizeReport(reportType, input, today) };
}

function canonicalizeReport(kind: ReportKind, input: Record<string, string>, today: string) {
  const parsed = parseReportSearchParams(input, today, kind);
  const params: StoredParams = {};
  if (parsed.query.preset !== "this-week") params.preset = parsed.query.preset;
  if (parsed.query.preset === "custom") {
    params.from = parsed.query.from;
    params.to = parsed.query.to;
  }
  const member = parseId(parsed.query.memberId);
  const client = parseId(parsed.query.clientId);
  const project = parseId(parsed.query.projectId);
  if (member) params.member = member;
  if (client) params.client = client;
  if (project) params.project = project;
  if (parsed.query.billable !== "all") params.billable = parsed.query.billable;
  if (parsed.query.groupBy !== defaultGroupBy(kind)) params.group = parsed.query.groupBy;
  params.columns = storedColumns(kind, parsed.query.columns);
  return params;
}

/** Unknown column ids are dropped. An absent list is stored empty so defaults are not frozen in. */
function storedColumns(kind: ReportKind, columns: string[] | null) {
  if (!columns) return "";
  return resolveColumns(kind, columns, true, true).join(",");
}

function canonicalizeTimeEdits(input: Record<string, string>, today: string) {
  const from = parseBoundedDate(input.from, today);
  const to = parseBoundedDate(input.to, today);
  const params: StoredParams = { from, to };
  const member = parseId(firstSearchParam(input.member));
  const client = parseId(firstSearchParam(input.client));
  const project = parseId(firstSearchParam(input.project));
  const action = parseEnumParam(input.action, changeActionFilters);
  if (member) params.member = member;
  if (client) params.client = client;
  if (project) params.project = project;
  if (action) params.action = action;
  return params;
}

/** Members save a report over their own rows. Amount columns are not stored. */
export function scopeStoredParams(
  actor: { id: string; role: string },
  reportType: SavedReportType,
  params: StoredParams,
) {
  const next = { ...params };
  if (!canManageWorkspace(actor.role)) {
    delete next.member;
    if (next.group === "member") delete next.group;
    if (reportType !== "manual-time-edits") {
      const allowed = new Set(defaultColumns(reportType, false, false));
      next.columns = (next.columns ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((id) => id && allowed.has(id))
        .join(",");
    }
  }
  return next;
}

export function savedReportHref(
  reportType: SavedReportType,
  params: StoredParams,
  options: { includeMember: boolean },
) {
  const search = new URLSearchParams();
  const keys = reportType === "manual-time-edits" ? timeEditParamKeys : reportParamKeys;
  for (const key of keys) {
    if (key === "member" && !options.includeMember) continue;
    const value = params[key];
    if (key === "columns") {
      search.set("columns", value ?? "");
      continue;
    }
    if (value) search.set(key, value);
  }
  const path =
    reportType === "manual-time-edits" ? "/reports/manual-time-edits" : `/reports/${reportType}`;
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export type SavedReportRecord = {
  id: string;
  name: string;
  reportType: string;
  visibility: string;
  params: PrismaTypes.JsonValue;
  createdById: string;
  createdByName: string;
};

export async function listVisibleSavedReports(actor: { id: string; role: string }) {
  const rows = await prisma.savedReport.findMany({
    where: {
      OR: [{ createdById: actor.id }, { visibility: "shared" }],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    reportType: row.reportType,
    visibility: row.visibility,
    params: row.params,
    createdById: row.createdById,
    createdByName: row.createdBy.name,
  }));
}

export async function createSavedReport(input: {
  actor: { id: string; role: string };
  name: string;
  reportType: SavedReportType;
  visibility: SavedVisibility;
  params: StoredParams;
  today: string;
}) {
  if (input.visibility === "shared" && !canManageWorkspace(input.actor.role)) {
    return { ok: false as const, code: savedReportCodes.SAVED_REPORT_SHARE, error: reportCopy.cannotShare };
  }
  const parsed = parseStoredReportParams(input.reportType, input.params, input.today);
  if (!parsed.ok) return parsed;
  const params = scopeStoredParams(input.actor, parsed.reportType, parsed.params);
  const existing = await prisma.savedReport.findFirst({
    where: nameWhere(input.actor.id, input.name),
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false as const,
      code: savedReportCodes.SAVED_REPORT_DUPLICATE,
      error: reportCopy.duplicateName,
    };
  }
  try {
    const created = await prisma.savedReport.create({
      data: {
        name: input.name,
        reportType: parsed.reportType,
        visibility: input.visibility,
        params,
        createdById: input.actor.id,
      },
    });
    return { ok: true as const, id: created.id };
  } catch (error) {
    if (isDuplicateName(error)) {
      return {
        ok: false as const,
        code: savedReportCodes.SAVED_REPORT_DUPLICATE,
        error: reportCopy.duplicateName,
      };
    }
    throw error;
  }
}

function nameWhere(createdById: string, name: string) {
  return {
    createdById,
    name: { equals: name, mode: "insensitive" as const },
  };
}

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function renameSavedReport(input: {
  actor: { id: string; role: string };
  id: string;
  name: string;
}) {
  const existing = await prisma.savedReport.findUnique({ where: { id: input.id } });
  if (!existing || !canReadSavedReport(input.actor, existing)) {
    return { ok: false as const, code: savedReportCodes.SAVED_REPORT_NOT_FOUND, error: reportCopy.savedUnavailable };
  }
  if (!canChangeSavedReport(input.actor, existing)) {
    return { ok: false as const, code: savedReportCodes.SAVED_REPORT_FORBIDDEN, error: reportCopy.savedForbidden };
  }
  const duplicate = await prisma.savedReport.findFirst({
    where: { ...nameWhere(existing.createdById, input.name), NOT: { id: existing.id } },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false as const, code: savedReportCodes.SAVED_REPORT_DUPLICATE, error: reportCopy.duplicateName };
  }
  try {
    await prisma.savedReport.update({ where: { id: existing.id }, data: { name: input.name } });
  } catch (error) {
    if (isDuplicateName(error)) {
      return { ok: false as const, code: savedReportCodes.SAVED_REPORT_DUPLICATE, error: reportCopy.duplicateName };
    }
    throw error;
  }
  return { ok: true as const };
}

export async function deleteSavedReport(input: { actor: { id: string; role: string }; id: string }) {
  const existing = await prisma.savedReport.findUnique({ where: { id: input.id } });
  if (!existing || !canReadSavedReport(input.actor, existing)) {
    return { ok: false as const, code: savedReportCodes.SAVED_REPORT_NOT_FOUND, error: reportCopy.savedUnavailable };
  }
  if (!canChangeSavedReport(input.actor, existing)) {
    return { ok: false as const, code: savedReportCodes.SAVED_REPORT_FORBIDDEN, error: reportCopy.savedForbidden };
  }
  await prisma.savedReport.delete({ where: { id: existing.id } });
  return { ok: true as const };
}

export function formParams(formData: FormData, keys: readonly string[]) {
  const raw: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") raw[key] = value;
  }
  return raw;
}

export function reportFormKeys(reportType: SavedReportType) {
  return reportType === "manual-time-edits" ? timeEditParamKeys : reportParamKeys;
}

export type { ReportKind, ReportQuery, GroupBy, ChangeActionFilter };
