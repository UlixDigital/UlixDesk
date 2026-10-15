import { rateCopy } from "@/lib/rate-copy";
import {
  actionVerb,
  changeByline,
  sourceLabel,
  timeChangeCopy,
  type ChangeAction,
  type ChangeSource,
} from "@/lib/time-change-copy";
import { formatTrackedDuration } from "@/lib/timesheet";

export type TimeChangeSnapshot = {
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  projectId: string;
  clientId: string | null;
  note: string | null;
  billable: boolean;
};

export type TimeChangeField = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

export type TimeChangeView = {
  id: string;
  timeEntryId: string;
  action: ChangeAction;
  actionLabel: string;
  source: ChangeSource;
  sourceLabel: string;
  changedAt: string;
  whenLabel: string;
  byline: string;
  forOther: boolean;
  fields: TimeChangeField[];
  unchanged: boolean;
};

const MONEY_KEY = /amount|currency|rate/i;

export function timeChangeSnapshot(
  entry: {
    startedAt: Date;
    endedAt: Date | null;
    projectId: string;
    billable: boolean;
    note: string | null;
  },
  clientId: string | null,
): TimeChangeSnapshot {
  return {
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationMs: entry.endedAt
      ? Math.max(0, entry.endedAt.getTime() - entry.startedAt.getTime())
      : null,
    projectId: entry.projectId,
    clientId,
    note: entry.note,
    billable: entry.billable,
  };
}

/** Columns written for one side. There is no amount, currency, or rate. */
export function timeChangeSideColumns(
  prefix: "before" | "after",
  snapshot: TimeChangeSnapshot | null,
) {
  if (prefix === "before") {
    return {
      beforeStartedAt: snapshot?.startedAt ?? null,
      beforeEndedAt: snapshot?.endedAt ?? null,
      beforeDurationMs: snapshot?.durationMs ?? null,
      beforeProjectId: snapshot?.projectId ?? null,
      beforeClientId: snapshot?.clientId ?? null,
      beforeNote: snapshot?.note ?? null,
      beforeBillable: snapshot?.billable ?? null,
    };
  }
  return {
    afterStartedAt: snapshot?.startedAt ?? null,
    afterEndedAt: snapshot?.endedAt ?? null,
    afterDurationMs: snapshot?.durationMs ?? null,
    afterProjectId: snapshot?.projectId ?? null,
    afterClientId: snapshot?.clientId ?? null,
    afterNote: snapshot?.note ?? null,
    afterBillable: snapshot?.billable ?? null,
  };
}

export function timeChangeColumnsOmitMoney(columns: Record<string, unknown>) {
  return Object.keys(columns).filter((key) => MONEY_KEY.test(key));
}

export function formatChangeWhen(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

function formatInstant(instant: Date | null, timeZone: string) {
  if (!instant) return timeChangeCopy.emptyValue;
  return formatChangeWhen(instant, timeZone);
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return timeChangeCopy.emptyValue;
  return formatTrackedDuration(durationMs);
}

function formatProject(projectId: string | null, names: ReadonlyMap<string, string>) {
  if (!projectId) return timeChangeCopy.emptyValue;
  return names.get(projectId) ?? timeChangeCopy.removedProject;
}

function formatClient(clientId: string | null, names: ReadonlyMap<string, string>) {
  if (!clientId) return timeChangeCopy.emptyValue;
  return names.get(clientId) ?? timeChangeCopy.removedClient;
}

function formatNote(note: string | null) {
  const trimmed = note?.trim() ?? "";
  return trimmed ? note ?? trimmed : timeChangeCopy.emptyValue;
}

function formatBillable(billable: boolean | null) {
  if (billable === null) return timeChangeCopy.emptyValue;
  return billable ? rateCopy.billablePrefix : rateCopy.nonBillable;
}

function field(
  label: string,
  before: string,
  after: string,
  changed: boolean,
): TimeChangeField {
  return { label, before, after, changed };
}

export function describeTimeChange(input: {
  id: string;
  timeEntryId: string;
  action: ChangeAction;
  source: ChangeSource;
  changedAt: Date;
  timeZone: string;
  actorId: string;
  actorName: string;
  entryUserId: string | null;
  entryUserName: string | null;
  before: TimeChangeSnapshot | null;
  after: TimeChangeSnapshot | null;
  projectNames: ReadonlyMap<string, string>;
  clientNames: ReadonlyMap<string, string>;
}): TimeChangeView {
  const before = input.before;
  const after = input.after;
  const fields: TimeChangeField[] = [
    field(
      timeChangeCopy.fieldStart,
      formatInstant(before?.startedAt ?? null, input.timeZone),
      formatInstant(after?.startedAt ?? null, input.timeZone),
      (before?.startedAt ?? null)?.getTime() !== (after?.startedAt ?? null)?.getTime(),
    ),
    field(
      timeChangeCopy.fieldEnd,
      formatInstant(before?.endedAt ?? null, input.timeZone),
      formatInstant(after?.endedAt ?? null, input.timeZone),
      (before?.endedAt ?? null)?.getTime() !== (after?.endedAt ?? null)?.getTime(),
    ),
    field(
      timeChangeCopy.fieldDuration,
      formatDuration(before?.durationMs ?? null),
      formatDuration(after?.durationMs ?? null),
      (before?.durationMs ?? null) !== (after?.durationMs ?? null),
    ),
    field(
      timeChangeCopy.fieldProject,
      formatProject(before?.projectId ?? null, input.projectNames),
      formatProject(after?.projectId ?? null, input.projectNames),
      (before?.projectId ?? null) !== (after?.projectId ?? null),
    ),
    field(
      timeChangeCopy.fieldClient,
      formatClient(before?.clientId ?? null, input.clientNames),
      formatClient(after?.clientId ?? null, input.clientNames),
      (before?.clientId ?? null) !== (after?.clientId ?? null),
    ),
    field(
      timeChangeCopy.fieldNotes,
      formatNote(before?.note ?? null),
      formatNote(after?.note ?? null),
      (before?.note ?? "").trim() !== (after?.note ?? "").trim(),
    ),
    field(
      timeChangeCopy.fieldBillable,
      formatBillable(before ? before.billable : null),
      formatBillable(after ? after.billable : null),
      (before ? before.billable : null) !== (after ? after.billable : null),
    ),
  ];
  return {
    id: input.id,
    timeEntryId: input.timeEntryId,
    action: input.action,
    actionLabel: actionVerb(input.action),
    source: input.source,
    sourceLabel: sourceLabel(input.source),
    changedAt: input.changedAt.toISOString(),
    whenLabel: formatChangeWhen(input.changedAt, input.timeZone),
    byline: changeByline(input),
    forOther: Boolean(input.entryUserId) && input.entryUserId !== input.actorId,
    fields,
    unchanged: fields.every((item) => !item.changed),
  };
}
