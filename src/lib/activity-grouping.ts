import type { MoneyTotal } from "@/lib/money";
import { sumMoney } from "@/lib/money";
import { reportCopy } from "@/lib/report-copy";
import {
  defaultActivitySort,
  defaultGroupBy,
  type ActivitySort,
  type ActivitySortKey,
  type GroupBy,
  type ReportKind,
  type SortDirection,
} from "@/lib/report-query";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDayHeading } from "@/lib/timesheet";

export type ActivitySlice = {
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  todoId: string;
  todoTitle: string;
  date: string;
  durationMs: number;
  billableMs: number;
  amount: MoneyTotal | null;
  unrated: boolean;
};

export type ActivityNode = {
  id: string;
  label: string;
  minDate: string;
  maxDate: string;
  durationMs: number;
  billableMs: number;
  amounts: MoneyTotal[];
  unrated: boolean;
  children: ActivityNode[];
};

/**
 * Members cannot group by member, and they cannot sort by amount.
 * A second group that repeats the first is dropped. Other reports stay one level.
 */
export function scopeActivityView(input: {
  kind: ReportKind;
  manager: boolean;
  showMoney: boolean;
  groupBy: GroupBy;
  groupBy2: GroupBy | null;
  sort: ActivitySort;
}) {
  let groupBy = input.groupBy;
  if (!input.manager && groupBy === "member") groupBy = defaultGroupBy(input.kind);
  let groupBy2 = input.kind === "time-activity" ? input.groupBy2 : null;
  if (!input.manager && groupBy2 === "member") groupBy2 = null;
  if (groupBy2 === groupBy) groupBy2 = null;
  let sort = input.kind === "time-activity" ? input.sort : defaultActivitySort(groupBy);
  if (!input.showMoney && sort.key === "amount") sort = defaultActivitySort(groupBy);
  if (sort.key !== "amount") sort = { ...sort, currency: null };
  return { groupBy, groupBy2, sort };
}

export function activityGroupKey(slice: ActivitySlice, groupBy: GroupBy) {
  if (groupBy === "member") return { id: slice.userId || "none", label: slice.userName };
  if (groupBy === "client") return { id: slice.clientId || "none", label: slice.clientName };
  if (groupBy === "project") return { id: slice.projectId, label: slice.projectName };
  if (groupBy === "todo") {
    if (!slice.todoId) return { id: "none", label: reportCopy.noTodo };
    return { id: slice.todoId, label: slice.todoTitle || reportCopy.noTodo };
  }
  return { id: slice.date, label: formatDayHeading(slice.date) };
}

function emptyNode(id: string, label: string): ActivityNode {
  return {
    id,
    label,
    minDate: "",
    maxDate: "",
    durationMs: 0,
    billableMs: 0,
    amounts: [],
    unrated: false,
    children: [],
  };
}

function earlier(current: string, next: string) {
  if (!current) return next;
  if (!next) return current;
  return current < next ? current : next;
}

function later(current: string, next: string) {
  if (!current) return next;
  if (!next) return current;
  return current > next ? current : next;
}

function absorb(node: ActivityNode, slice: ActivitySlice) {
  node.durationMs += slice.durationMs;
  node.billableMs += slice.billableMs;
  node.amounts = sumMoney([...node.amounts, slice.amount]);
  node.unrated = node.unrated || slice.unrated;
  node.minDate = earlier(node.minDate, slice.date);
  node.maxDate = later(node.maxDate, slice.date);
}

function signed(delta: number, direction: SortDirection) {
  if (delta === 0) return 0;
  return direction === "asc" ? delta : -delta;
}

function amountOf(amounts: MoneyTotal[], currency: string) {
  return amounts.find((amount) => amount.currency === currency)?.amountMinor ?? 0;
}

/**
 * Currencies are compared one code at a time and are never added together.
 * Ties fall back to the name, then the id, so the order stays put.
 */
export function compareActivityGroups(a: ActivityNode, b: ActivityNode, sort: ActivitySort) {
  let primary = 0;
  if (sort.key === "name") {
    primary = signed(
      a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }),
      sort.direction,
    );
  } else if (sort.key === "time") {
    primary = signed(a.durationMs - b.durationMs, sort.direction);
  } else if (sort.key === "billable") {
    primary = signed(a.billableMs - b.billableMs, sort.direction);
  } else if (sort.key === "date") {
    const aKey = sort.direction === "asc" ? a.minDate : a.maxDate;
    const bKey = sort.direction === "asc" ? b.minDate : b.maxDate;
    if (aKey !== bKey) {
      if (!aKey) primary = 1;
      else if (!bKey) primary = -1;
      else primary = signed(aKey < bKey ? -1 : 1, sort.direction);
    }
  } else {
    const currencies = sort.currency
      ? [sort.currency]
      : [...new Set([...a.amounts.map((amount) => amount.currency), ...b.amounts.map((amount) => amount.currency)])].sort(
          (left, right) => left.localeCompare(right),
        );
    for (const currency of currencies) {
      const delta = amountOf(a.amounts, currency) - amountOf(b.amounts, currency);
      if (delta !== 0) {
        primary = signed(delta, sort.direction);
        break;
      }
    }
  }
  if (primary !== 0) return primary;
  const byName = a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id, "en");
}

export function buildActivityTree(input: {
  slices: ActivitySlice[];
  groupBy: GroupBy;
  groupBy2: GroupBy | null;
  sort: ActivitySort;
}) {
  const roots = new Map<string, ActivityNode & { childMap: Map<string, ActivityNode> }>();
  for (const slice of input.slices) {
    const primary = activityGroupKey(slice, input.groupBy);
    let root = roots.get(primary.id);
    if (!root) {
      root = { ...emptyNode(primary.id, primary.label), childMap: new Map() };
      roots.set(primary.id, root);
    }
    absorb(root, slice);
    if (!input.groupBy2) continue;
    const secondary = activityGroupKey(slice, input.groupBy2);
    let child = root.childMap.get(secondary.id);
    if (!child) {
      child = emptyNode(secondary.id, secondary.label);
      root.childMap.set(secondary.id, child);
    }
    absorb(child, slice);
  }
  return [...roots.values()]
    .map((root) => ({
      id: root.id,
      label: root.label,
      minDate: root.minDate,
      maxDate: root.maxDate,
      durationMs: root.durationMs,
      billableMs: root.billableMs,
      amounts: root.amounts,
      unrated: root.unrated,
      children: [...root.childMap.values()].sort((a, b) => compareActivityGroups(a, b, input.sort)),
    }))
    .sort((a, b) => compareActivityGroups(a, b, input.sort));
}

export function columnActivitySort(
  columnId: string,
  groupBy: GroupBy,
  groupBy2: GroupBy | null,
): { key: ActivitySortKey; currency: string | null } | null {
  if (columnId === "group") return { key: groupBy === "date" ? "date" : "name", currency: null };
  if (columnId === "group2" && groupBy2) {
    return { key: groupBy2 === "date" ? "date" : "name", currency: null };
  }
  if (columnId === "hours") return { key: "time", currency: null };
  if (columnId === "billableHours") return { key: "billable", currency: null };
  if (columnId.startsWith("amount:")) {
    const currency = columnId.slice("amount:".length);
    if (!isCurrencyCode(currency)) return null;
    return { key: "amount", currency };
  }
  return null;
}

function preferredDirection(key: ActivitySortKey): SortDirection {
  return key === "name" ? "asc" : "desc";
}

/** The sort a column header applies. The same column toggles direction. */
export function nextColumnSort(input: {
  current: ActivitySort;
  columnId: string;
  groupBy: GroupBy;
  groupBy2: GroupBy | null;
}): ActivitySort | null {
  const target = columnActivitySort(input.columnId, input.groupBy, input.groupBy2);
  if (!target) return null;
  const same =
    input.current.key === target.key &&
    (target.key !== "amount" || input.current.currency === target.currency);
  if (same) {
    return {
      key: target.key,
      currency: target.currency,
      direction: input.current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key: target.key, currency: target.currency, direction: preferredDirection(target.key) };
}

/** The header that shows the direction arrow for the active sort. */
export function sortArrowColumnId(
  columns: Array<{ id: string }>,
  groupBy: GroupBy,
  groupBy2: GroupBy | null,
  sort: ActivitySort,
) {
  const matches = columns.filter((column) => {
    const target = columnActivitySort(column.id, groupBy, groupBy2);
    if (!target || target.key !== sort.key) return false;
    if (sort.key !== "amount") return true;
    if (sort.currency) return target.currency === sort.currency;
    return true;
  });
  if (matches.length === 0) return null;
  if (sort.key === "amount" && !sort.currency) return matches[0]?.id ?? null;
  if (sort.key === "name" || sort.key === "date") {
    return matches.find((column) => column.id === "group")?.id ?? matches[0]?.id ?? null;
  }
  return matches[0]?.id ?? null;
}
