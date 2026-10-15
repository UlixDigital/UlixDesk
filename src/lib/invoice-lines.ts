import {
  formatDurationHms,
  formatInvoiceDate,
  formatInvoiceRange,
  lineAmountMinor,
  periodLineTitle,
  secondsFromMs,
} from "@/lib/invoice-money";

export type InvoiceGrouping = "period" | "project" | "member" | "day";

export type InvoiceSlice = {
  timeEntryId: string;
  projectId: string;
  projectName: string;
  userId: string | null;
  userName: string;
  /** Workspace calendar date of startedAt. */
  day: string;
  durationMs: number;
  /** Null when the entry has no rate, or the rate currency is not the client's. */
  rateMinor: number | null;
  unratedReason: "no-rate" | "currency" | null;
};

export type BuiltInvoiceLine = {
  kind: "time";
  title: string;
  detail: string;
  quantitySeconds: number;
  unitPriceMinor: number;
  amountMinor: number;
  timeEntryIds: string[];
};

export type UnratedTime = {
  timeEntryId: string;
  projectName: string;
  userName: string;
  day: string;
  durationSeconds: number;
  reason: "no-rate" | "currency";
};

/**
 * Group billable slices, then split a group that contains more than one rate.
 * The line amount is billAmountMinor of the combined duration, so
 * quantity × unit price rounds to the line amount. Summing per-entry
 * rounding is not used.
 */
export function buildInvoiceLines(input: {
  grouping: InvoiceGrouping;
  periodStart: string;
  periodEnd: string;
  slices: InvoiceSlice[];
}): { lines: BuiltInvoiceLine[]; unrated: UnratedTime[] } {
  const unrated: UnratedTime[] = [];
  const groups = new Map<
    string,
    {
      sort: string;
      title: string;
      detail: string;
      unitPriceMinor: number;
      durationMs: number;
      timeEntryIds: string[];
    }
  >();

  const ordered = [...input.slices].sort((a, b) => {
    const byDay = a.day.localeCompare(b.day);
    if (byDay !== 0) return byDay;
    const byProject = a.projectName.localeCompare(b.projectName, "en", { sensitivity: "base" });
    if (byProject !== 0) return byProject;
    const byUser = a.userName.localeCompare(b.userName, "en", { sensitivity: "base" });
    if (byUser !== 0) return byUser;
    return a.timeEntryId.localeCompare(b.timeEntryId);
  });

  for (const slice of ordered) {
    if (slice.durationMs <= 0) continue;
    if (slice.rateMinor === null) {
      unrated.push({
        timeEntryId: slice.timeEntryId,
        projectName: slice.projectName,
        userName: slice.userName,
        day: slice.day,
        durationSeconds: secondsFromMs(slice.durationMs),
        reason: slice.unratedReason ?? "no-rate",
      });
      continue;
    }
    const title = lineTitle(input.grouping, input.periodStart, input.periodEnd, slice);
    const detail =
      input.grouping === "day" ? "" : formatInvoiceRange(input.periodStart, input.periodEnd);
    const sort = sortKey(input.grouping, slice);
    const key = `${input.grouping}:${sort}:${slice.rateMinor}`;
    const existing = groups.get(key);
    if (existing) {
      existing.durationMs += slice.durationMs;
      existing.timeEntryIds.push(slice.timeEntryId);
      continue;
    }
    groups.set(key, {
      sort,
      title,
      detail,
      unitPriceMinor: slice.rateMinor,
      durationMs: slice.durationMs,
      timeEntryIds: [slice.timeEntryId],
    });
  }

  const lines = [...groups.values()]
    .sort((a, b) => {
      const bySort = a.sort.localeCompare(b.sort, "en", { sensitivity: "base" });
      if (bySort !== 0) return bySort;
      return a.unitPriceMinor - b.unitPriceMinor;
    })
    .flatMap((group) => {
      const quantitySeconds = secondsFromMs(group.durationMs);
      if (quantitySeconds <= 0) return [];
      return [
        {
          kind: "time" as const,
          title: group.title,
          detail: group.detail,
          quantitySeconds,
          unitPriceMinor: group.unitPriceMinor,
          amountMinor: lineAmountMinor(group.unitPriceMinor, quantitySeconds),
          timeEntryIds: group.timeEntryIds,
        },
      ];
    });

  unrated.sort((a, b) => a.day.localeCompare(b.day) || a.userName.localeCompare(b.userName));
  return { lines, unrated };
}

export function unratedLineLabel(item: UnratedTime) {
  const reason = item.reason === "currency" ? " (rate currency does not match the client)" : "";
  return `${item.userName} · ${item.projectName} · ${formatInvoiceDate(item.day)} · ${formatDurationHms(item.durationSeconds)}${reason}`;
}

function lineTitle(
  grouping: InvoiceGrouping,
  periodStart: string,
  periodEnd: string,
  slice: InvoiceSlice,
) {
  if (grouping === "project") return slice.projectName;
  if (grouping === "member") return slice.userName;
  if (grouping === "day") return formatInvoiceDate(slice.day);
  return periodLineTitle(periodStart, periodEnd);
}

function sortKey(grouping: InvoiceGrouping, slice: InvoiceSlice) {
  if (grouping === "project") return slice.projectName;
  if (grouping === "member") return slice.userName;
  if (grouping === "day") return slice.day;
  return "0";
}
