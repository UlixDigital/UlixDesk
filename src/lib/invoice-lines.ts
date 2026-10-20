import {
  formatDurationHms,
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceRange,
  lineAmountMinor,
  secondsFromMs,
} from "@/lib/invoice-money";

export type InvoiceGrouping = "period" | "project" | "member" | "day";

export type InvoiceWindow = {
  timeEntryId: string;
  sliceStart: Date;
  sliceEnd: Date;
};

export type InvoiceSlice = {
  timeEntryId: string;
  projectId: string;
  projectName: string;
  userId: string | null;
  userName: string;
  /** Workspace calendar date of this slice, after the midnight split. */
  day: string;
  durationMs: number;
  /** The billed window. Exclusive of any part already on another invoice. */
  sliceStart: Date;
  sliceEnd: Date;
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
  windows: InvoiceWindow[];
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
 * rounding is not used. When one project would be listed twice because of
 * that split, each line adds the member name, or the rate when the member
 * name would still match.
 */
export function buildInvoiceLines(input: {
  grouping: InvoiceGrouping;
  periodStart: string;
  periodEnd: string;
  currency: string;
  slices: InvoiceSlice[];
}): { lines: BuiltInvoiceLine[]; unrated: UnratedTime[] } {
  const unrated: UnratedTime[] = [];
  const groups = new Map<
    string,
    {
      sort: string;
      detail: string;
      unitPriceMinor: number;
      durationMs: number;
      projectNames: string[];
      userNames: string[];
      day: string;
      timeEntryIds: string[];
      windows: InvoiceWindow[];
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
    const detail =
      input.grouping === "day" ? "" : formatInvoiceRange(input.periodStart, input.periodEnd);
    const sort = sortKey(input.grouping, slice);
    const key = `${input.grouping}:${sort}:${slice.rateMinor}`;
    const existing = groups.get(key);
    if (existing) {
      existing.durationMs += slice.durationMs;
      if (!existing.projectNames.includes(slice.projectName)) existing.projectNames.push(slice.projectName);
      if (!existing.userNames.includes(slice.userName)) existing.userNames.push(slice.userName);
      if (!existing.timeEntryIds.includes(slice.timeEntryId)) {
        existing.timeEntryIds.push(slice.timeEntryId);
      }
      existing.windows.push({
        timeEntryId: slice.timeEntryId,
        sliceStart: slice.sliceStart,
        sliceEnd: slice.sliceEnd,
      });
      continue;
    }
    groups.set(key, {
      sort,
      detail,
      unitPriceMinor: slice.rateMinor,
      durationMs: slice.durationMs,
      projectNames: [slice.projectName],
      userNames: [slice.userName],
      day: slice.day,
      timeEntryIds: [slice.timeEntryId],
      windows: [
        {
          timeEntryId: slice.timeEntryId,
          sliceStart: slice.sliceStart,
          sliceEnd: slice.sliceEnd,
        },
      ],
    });
  }

  const visible = [...groups.values()]
    .filter((group) => secondsFromMs(group.durationMs) > 0)
    .sort((a, b) => {
      const bySort = a.sort.localeCompare(b.sort, "en", { sensitivity: "base" });
      if (bySort !== 0) return bySort;
      return a.unitPriceMinor - b.unitPriceMinor;
    });
  const titles = titlesForRateSplits(input.grouping, visible, input.currency);
  const lines = visible.map((group, index) => {
    const quantitySeconds = secondsFromMs(group.durationMs);
    return {
      kind: "time" as const,
      title: titles[index] ?? groupTitle(input.grouping, group.projectNames, group.userNames, group.day),
      detail: group.detail,
      quantitySeconds,
      unitPriceMinor: group.unitPriceMinor,
      amountMinor: lineAmountMinor(group.unitPriceMinor, quantitySeconds),
      timeEntryIds: group.timeEntryIds,
      windows: group.windows,
    };
  });

  unrated.sort((a, b) => a.day.localeCompare(b.day) || a.userName.localeCompare(b.userName));
  return { lines, unrated };
}

export type TimeLineSnapshot = {
  title: string;
  detail: string;
  quantitySeconds: number;
  unitPriceMinor: number;
  amountMinor: number;
};

/** Human-readable differences between the draft's time lines and a fresh derive. */
export function describeTimeLineChanges(
  stored: TimeLineSnapshot[],
  derived: TimeLineSnapshot[],
  currency: string,
) {
  const unused = derived.map((line, index) => ({ line, index }));
  const diffs: string[] = [];
  for (const line of stored) {
    const match = unused.findIndex(
      (candidate) =>
        candidate.line.title === line.title &&
        candidate.line.detail === line.detail &&
        candidate.line.unitPriceMinor === line.unitPriceMinor,
    );
    if (match < 0) {
      diffs.push(`Removed ${lineLabel(line, currency)}`);
      continue;
    }
    const next = unused[match]?.line;
    unused.splice(match, 1);
    if (!next) continue;
    if (next.quantitySeconds !== line.quantitySeconds || next.amountMinor !== line.amountMinor) {
      diffs.push(`${line.title}: ${lineLabel(line, currency)} -> ${lineLabel(next, currency)}`);
    }
  }
  for (const candidate of unused) {
    diffs.push(`Added ${lineLabel(candidate.line, currency)}`);
  }
  return diffs;
}

function lineLabel(line: TimeLineSnapshot, currency: string) {
  return `${formatDurationHms(line.quantitySeconds)} ${formatInvoiceMoney(line.amountMinor, currency)}`;
}

export function unratedLineLabel(item: UnratedTime) {
  const reason = item.reason === "currency" ? " (rate currency does not match the client)" : "";
  return `${item.userName} · ${item.projectName} · ${formatInvoiceDate(item.day)} · ${formatDurationHms(item.durationSeconds)}${reason}`;
}

/** Project name, with the member name when the line is split by member. */
function groupTitle(grouping: InvoiceGrouping, projectNames: string[], userNames: string[], day: string) {
  const projects = [...new Set(projectNames)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const projectLabel = projects.join(", ");
  const members = memberLabel(userNames);
  if (grouping === "member") return projectLabel ? `${projectLabel} · ${members}` : members;
  if (grouping === "day") return formatInvoiceDate(day);
  return projectLabel;
}

/**
 * Same project and same rate stay one line. A rate split that would repeat
 * the title adds the member name. When that still matches, it adds the rate.
 */
function titlesForRateSplits(
  grouping: InvoiceGrouping,
  groups: Array<{ projectNames: string[]; userNames: string[]; day: string; unitPriceMinor: number }>,
  currency: string,
) {
  const bases = groups.map((group) => groupTitle(grouping, group.projectNames, group.userNames, group.day));
  const baseCounts = counts(bases);
  const withMember = bases.map((base, index) => {
    if ((baseCounts.get(base) ?? 0) < 2 || grouping === "member") return base;
    const members = memberLabel(groups[index]?.userNames ?? []);
    return members ? `${base} · ${members}` : base;
  });
  const memberCounts = counts(withMember);
  return withMember.map((title, index) => {
    if ((memberCounts.get(title) ?? 0) < 2) return title;
    const rate = formatInvoiceMoney(groups[index]?.unitPriceMinor ?? 0, currency);
    return `${bases[index] ?? title} · ${rate}`;
  });
}

function memberLabel(userNames: string[]) {
  return [...new Set(userNames.map((name) => name.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .join(", ");
}

function counts(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

function sortKey(grouping: InvoiceGrouping, slice: InvoiceSlice) {
  if (grouping === "project") return slice.projectName;
  if (grouping === "member") return slice.userName;
  if (grouping === "day") return slice.day;
  return "0";
}
