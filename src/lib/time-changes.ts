import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  describeTimeChange,
  timeChangeSideColumns,
  timeChangeSnapshot,
  type TimeChangeSnapshot,
  type TimeChangeView,
} from "@/lib/time-change-display";
import {
  changeActionFilters,
  type ChangeAction,
  type ChangeActionFilter,
  type ChangeSource,
} from "@/lib/time-change-copy";
import { isRealCalendarDate } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";

export { timeChangeSnapshot };
export type { TimeChangeSnapshot, TimeChangeView };

export const TIME_CHANGE_PAGE_SIZE = 50;

export type ChangeContext = {
  actorId: string;
  source: ChangeSource;
  changedAt: Date;
};

export function changeContext(
  userId: string,
  now: Date,
  change?: Partial<ChangeContext>,
): ChangeContext {
  return {
    actorId: change?.actorId ?? userId,
    source: change?.source ?? "web",
    changedAt: change?.changedAt ?? now,
  };
}

/**
 * Insert one log row. Callers run this inside the same transaction as the
 * time entry write. There is no update or delete function.
 */
export async function recordTimeChange(
  tx: Prisma.TransactionClient,
  input: {
    timeEntryId: string;
    action: ChangeAction;
    before: TimeChangeSnapshot | null;
    after: TimeChangeSnapshot | null;
  } & ChangeContext & { entryUserId: string | null },
) {
  await tx.timeChange.create({
    data: {
      timeEntryId: input.timeEntryId,
      action: input.action,
      source: input.source,
      actorId: input.actorId,
      entryUserId: input.entryUserId,
      changedAt: input.changedAt,
      ...timeChangeSideColumns("before", input.before),
      ...timeChangeSideColumns("after", input.after),
    },
  });
}

/** Owners and admins may filter by member. Everyone else is limited to their own entries. */
export function scopedEntryUserId(
  actor: { id: string; role: string },
  requestedMemberId: string | null,
) {
  if (!canManageWorkspace(actor.role)) return actor.id;
  return requestedMemberId;
}

export function parseChangeAction(value: string | undefined): ChangeActionFilter | null {
  const action = (value ?? "").trim();
  if (changeActionFilters.includes(action as ChangeActionFilter)) {
    return action as ChangeActionFilter;
  }
  return null;
}

export function parseDateParam(value: string | undefined, fallback: string) {
  const trimmed = (value ?? "").trim();
  return isRealCalendarDate(trimmed) ? trimmed : fallback;
}

export function parsePage(value: string | undefined) {
  const page = Number((value ?? "").trim());
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function timeChangeWhere(input: {
  actor: { id: string; role: string };
  from: Date;
  to: Date;
  memberId: string | null;
  clientId: string | null;
  projectId: string | null;
  action: ChangeActionFilter | null;
}): Prisma.TimeChangeWhereInput {
  const entryUserId = scopedEntryUserId(input.actor, input.memberId);
  const and: Prisma.TimeChangeWhereInput[] = [];
  if (input.projectId) {
    and.push({
      OR: [{ beforeProjectId: input.projectId }, { afterProjectId: input.projectId }],
    });
  }
  if (input.clientId) {
    and.push({
      OR: [{ beforeClientId: input.clientId }, { afterClientId: input.clientId }],
    });
  }
  return {
    changedAt: { gte: input.from, lt: input.to },
    ...(entryUserId ? { entryUserId } : {}),
    ...(input.action === "timer"
      ? { action: { in: ["started", "stopped"] } }
      : input.action
        ? { action: input.action }
        : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function snapshotFromRow(
  row: {
    beforeStartedAt: Date | null;
    beforeEndedAt: Date | null;
    beforeDurationMs: number | null;
    beforeProjectId: string | null;
    beforeClientId: string | null;
    beforeNote: string | null;
    beforeBillable: boolean | null;
    afterStartedAt: Date | null;
    afterEndedAt: Date | null;
    afterDurationMs: number | null;
    afterProjectId: string | null;
    afterClientId: string | null;
    afterNote: string | null;
    afterBillable: boolean | null;
  },
  side: "before" | "after",
): TimeChangeSnapshot | null {
  const startedAt = side === "before" ? row.beforeStartedAt : row.afterStartedAt;
  const projectId = side === "before" ? row.beforeProjectId : row.afterProjectId;
  const billable = side === "before" ? row.beforeBillable : row.afterBillable;
  if (!startedAt || !projectId || billable === null) return null;
  return {
    startedAt,
    endedAt: side === "before" ? row.beforeEndedAt : row.afterEndedAt,
    durationMs: side === "before" ? row.beforeDurationMs : row.afterDurationMs,
    projectId,
    clientId: side === "before" ? row.beforeClientId : row.afterClientId,
    note: side === "before" ? row.beforeNote : row.afterNote,
    billable,
  };
}

function isChangeAction(value: string): value is ChangeAction {
  return (
    value === "added" ||
    value === "edited" ||
    value === "deleted" ||
    value === "started" ||
    value === "stopped"
  );
}

function isChangeSource(value: string): value is ChangeSource {
  return value === "web" || value === "extension" || value === "api";
}

export async function listTimeChanges(input: {
  actor: { id: string; role: string };
  from: Date;
  to: Date;
  timeZone: string;
  memberId: string | null;
  clientId: string | null;
  projectId: string | null;
  action: ChangeActionFilter | null;
  page: number;
  pageSize?: number;
}) {
  const pageSize = input.pageSize ?? TIME_CHANGE_PAGE_SIZE;
  const where = timeChangeWhere(input);
  const total = await prisma.timeChange.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(input.page, pageCount);
  const rows = await prisma.timeChange.findMany({
    where,
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      actor: { select: { id: true, name: true } },
      entryUser: { select: { id: true, name: true } },
    },
  });
  const projectIds = [
    ...new Set(
      rows.flatMap((row) => [row.beforeProjectId, row.afterProjectId].filter((id) => id !== null)),
    ),
  ];
  const projects =
    projectIds.length === 0
      ? []
      : await prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        });
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const items = rows.flatMap((row) => {
    if (!isChangeAction(row.action) || !isChangeSource(row.source)) return [];
    return [
      describeTimeChange({
        id: row.id,
        timeEntryId: row.timeEntryId,
        action: row.action,
        source: row.source,
        changedAt: row.changedAt,
        timeZone: input.timeZone,
        actorId: row.actorId,
        actorName: row.actor.name,
        entryUserId: row.entryUserId,
        entryUserName: row.entryUser?.name ?? null,
        before: snapshotFromRow(row, "before"),
        after: snapshotFromRow(row, "after"),
        projectNames,
      }),
    ];
  });
  return { items, total, page, pageSize, pageCount };
}
