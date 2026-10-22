"use client";

import { useEffect } from "react";
import {
  activitySortToken,
  parseActivitySort,
  reportHref,
  groupByOptions,
  type ActivitySort,
  type GroupBy,
  type ReportKind,
  type ReportQuery,
} from "@/lib/report-query";
import { parseEnumParam } from "@/lib/search-params";

const columnKey = (kind: ReportKind) => `ulixdesk.report-columns.${kind}`;
const viewKey = "ulixdesk.report-view.time-activity";

/**
 * Restores the last columns, and for Time & Activity the last group and sort,
 * when the URL does not already name them. URL params win.
 */
export function ReportRemember({
  kind,
  columnsInUrl,
  columns,
  viewInUrl,
  manager,
  showMoney,
  query,
}: {
  kind: ReportKind;
  columnsInUrl: boolean;
  columns: string[];
  viewInUrl: boolean;
  manager: boolean;
  showMoney: boolean;
  query: ReportQuery;
}) {
  const columnSaved = columns.join(",");
  const viewSaved = JSON.stringify({
    group: query.groupBy,
    then: query.groupBy2 ?? "",
    sort: activitySortToken(query.sort),
  });
  const queryKey = JSON.stringify({
    preset: query.preset,
    from: query.from,
    to: query.to,
    memberId: query.memberId,
    clientId: query.clientId,
    projectId: query.projectId,
    todoId: query.todoId,
    billable: query.billable,
    groupBy: query.groupBy,
    groupBy2: query.groupBy2,
    sort: activitySortToken(query.sort),
    columns: query.columns,
    page: query.page,
  });

  useEffect(() => {
    const current = new URL(window.location.href);
    let columnOverride: string | null = null;
    if (!columnsInUrl) {
      const remembered = window.localStorage.getItem(columnKey(kind));
      if (remembered && remembered !== columnSaved) columnOverride = remembered;
    }

    if (kind === "time-activity") {
      if (viewInUrl) {
        window.localStorage.setItem(viewKey, viewSaved);
      } else {
        const raw = window.localStorage.getItem(viewKey);
        const next = raw ? rememberedView(raw, query, manager, showMoney) : null;
        if (next && JSON.stringify(next) !== viewSaved) {
          const href = reportHref(kind, {
            ...query,
            columns: columnsInUrl ? query.columns : null,
            groupBy: next.group,
            groupBy2: next.then,
            sort: next.sort,
            page: 1,
          });
          const target = new URL(href, window.location.origin);
          if (columnOverride !== null) target.searchParams.set("columns", columnOverride);
          const nextUrl = `${target.pathname}${target.search}`;
          if (nextUrl !== `${current.pathname}${current.search}`) {
            window.location.replace(nextUrl);
            return;
          }
        }
      }
    }

    if (columnOverride !== null) {
      current.searchParams.set("columns", columnOverride);
      window.location.replace(`${current.pathname}${current.search}`);
    }
  }, [kind, columnsInUrl, columnSaved, viewInUrl, viewSaved, manager, showMoney, query, queryKey]);

  return null;
}

function rememberedView(
  raw: string,
  query: ReportQuery,
  manager: boolean,
  showMoney: boolean,
): { group: GroupBy; then: GroupBy | null; sort: ActivitySort } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.group !== "string" || typeof record.sort !== "string") return null;
  const group = parseEnumParam(record.group, groupByOptions);
  if (!group) return null;
  const then = typeof record.then === "string" ? parseEnumParam(record.then, groupByOptions) : null;
  const sort = parseActivitySort(record.sort);
  if (!sort) return null;
  const groupBy: GroupBy = !manager && group === "member" ? query.groupBy : group;
  let groupBy2 = !manager && then === "member" ? null : then;
  if (groupBy2 === groupBy) groupBy2 = null;
  const nextSort = !showMoney && sort.key === "amount" ? query.sort : sort;
  return { group: groupBy, then: groupBy2, sort: nextSort };
}
