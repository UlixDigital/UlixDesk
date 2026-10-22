import { BudgetReachedError, budgetAlertForViewer, guardProjectBudget } from "@/lib/budgets";
import { prisma } from "@/lib/db";
import { InvoicedTimeError, isInvoicedTimeError, timeEntryIsLocked } from "@/lib/invoice-lock";
import {
  changeContext,
  recordTimeChange,
  timeChangeSnapshot,
  type ChangeContext,
} from "@/lib/time-changes";
import {
  MAX_ENTRY_MS,
  MIN_TIMER_MS,
  NOTE_MAX,
  type TimerFailureCode,
} from "@/lib/time-copy";
import type { TimesheetEntry } from "@/lib/timesheet";
import { resolveTodoForEntry, TodoUnavailableError } from "@/lib/todos";
import { intervalsOverlap, normalizeNote } from "@/lib/time-validation";

/**
 * Legacy running-timer id from before each person had an account.
 * Bootstrap reassigns that row to the owner. New timers use the user id.
 */
export const WORKSPACE_TIMER_ID = "workspace";

export type TimeProject = {
  id: string;
  name: string;
  billable: boolean;
  archivedAt: Date | null;
  client: { id: string; name: string; archivedAt: Date | null } | null;
};

export type TimeEntryRecord = {
  id: string;
  projectId: string;
  userId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  billable: boolean;
  note: string | null;
  source: "manual" | "timer";
  todoId: string | null;
  todo: { id: string; title: string; status: string; archivedAt: Date | null } | null;
  project: TimeProject;
};

export type PickerProject = {
  id: string;
  name: string;
  billable: boolean;
  clientId: string | null;
  clientName: string | null;
};

export type ManualEntryInput = {
  projectId: string;
  startedAt: Date;
  endedAt: Date;
  billable: boolean;
  note: string | null;
  todoId?: string | null;
};

const entryInclude = {
  project: {
    select: {
      id: true,
      name: true,
      billable: true,
      archivedAt: true,
      client: { select: { id: true, name: true, archivedAt: true } },
    },
  },
  todo: { select: { id: true, title: true, status: true, archivedAt: true } },
} as const;

type EntryRow = {
  id: string;
  projectId: string;
  userId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  billable: boolean;
  note: string | null;
  source: string;
  todoId: string | null;
  todo: { id: string; title: string; status: string; archivedAt: Date | null } | null;
  project: TimeProject;
};

function toRecord(row: EntryRow): TimeEntryRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    billable: row.billable,
    note: row.note,
    source: row.source === "timer" ? "timer" : "manual",
    todoId: row.todoId,
    todo: row.todo,
    project: row.project,
  };
}

function toTimesheetEntry(row: TimeEntryRecord): TimesheetEntry | null {
  if (!row.endedAt) return null;
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    projectArchived: row.project.archivedAt !== null,
    clientId: row.project.client?.id ?? null,
    clientName: row.project.client?.name ?? null,
    userId: row.userId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    billable: row.billable,
    projectBillable: row.project.billable,
    rate: null,
    note: row.note,
    source: row.source,
    todoTitle: row.todo?.title ?? null,
  };
}

export function durationMs(entry: { startedAt: Date; endedAt: Date | null }) {
  if (!entry.endedAt) return 0;
  return Math.max(0, entry.endedAt.getTime() - entry.startedAt.getTime());
}

export async function listActiveProjectsForPicker(): Promise<PickerProject[]> {
  const rows = await prisma.project.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      name: true,
      billable: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      billable: row.billable,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
    }))
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id);
    });
}

export async function listProjectsForTimesheetFilter() {
  const rows = await prisma.project.findMany({
    select: { id: true, name: true, archivedAt: true, clientId: true },
  });
  return [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

/** Active projects, plus the entry's current project when that project is archived. */
export async function listProjectChoices(currentProjectId: string | null) {
  const rows = await prisma.project.findMany({
    where: currentProjectId
      ? { OR: [{ archivedAt: null }, { id: currentProjectId }] }
      : { archivedAt: null },
    select: {
      id: true,
      name: true,
      billable: true,
      archivedAt: true,
      client: { select: { name: true } },
    },
  });
  return [...rows]
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id);
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      billable: row.billable,
      archived: row.archivedAt !== null,
      clientName: row.client?.name ?? null,
    }));
}

export async function projectSelectionError(
  projectId: string,
  currentProjectId: string | null,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { archivedAt: true },
  });
  if (!project) return "missing" as const;
  if (project.archivedAt && projectId !== currentProjectId) return "archived" as const;
  return null;
}

/** `userId` null means every person. Callers that are members pass their own id. */
export async function getTimeEntry(id: string, userId: string | null) {
  const row = await prisma.timeEntry.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: entryInclude,
  });
  return row ? toRecord(row) : null;
}

export async function listEntriesOverlapping(input: {
  rangeStart: Date;
  rangeEnd: Date;
  projectId?: string;
  clientId?: string;
  userId: string | null;
}) {
  const rows = await prisma.timeEntry.findMany({
    where: {
      ...(input.userId ? { userId: input.userId } : {}),
      endedAt: { not: null, gt: input.rangeStart },
      startedAt: { lt: input.rangeEnd },
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.clientId ? { project: { clientId: input.clientId } } : {}),
    },
    include: entryInclude,
  });
  return rows
    .map((row) => toTimesheetEntry(toRecord(row)))
    .filter((entry): entry is TimesheetEntry => entry !== null);
}

export type OverlapCandidate = {
  id: string;
  startedAt: string;
  endedAt: string;
};

/** Completed entries, plus the running timer closed at `now`, for the overlap warning. */
export async function listOverlapCandidates(now: Date, userId: string): Promise<OverlapCandidate[]> {
  const rows = await prisma.timeEntry.findMany({
    where: { userId },
    select: { id: true, startedAt: true, endedAt: true },
  });
  const candidates: OverlapCandidate[] = [];
  for (const row of rows) {
    const endedAt = row.endedAt ?? now;
    if (endedAt <= row.startedAt) continue;
    candidates.push({
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    });
  }
  return candidates;
}

export async function hasOverlap(input: {
  startedAt: Date;
  endedAt: Date;
  excludeId?: string;
  now: Date;
  userId: string;
}) {
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId: input.userId,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      startedAt: { lt: input.endedAt },
    },
    select: { startedAt: true, endedAt: true },
  });
  return rows.some((row) => {
    const endedAt = row.endedAt ?? input.now;
    return intervalsOverlap(input.startedAt, input.endedAt, row.startedAt, endedAt);
  });
}

export async function createManualEntry(
  input: ManualEntryInput,
  now: Date,
  userId: string,
  change?: Partial<ChangeContext>,
) {
  if (input.todoId) {
    const resolved = await resolveTodoForEntry({
      actorId: userId,
      projectId: input.projectId,
      todoId: input.todoId,
    });
    if (!resolved.ok) throw new TodoUnavailableError();
  }
  const overlap = await hasOverlap({
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    now,
    userId,
  });
  const context = changeContext(userId, now, change);
  const created = await prisma.$transaction(async (tx) => {
    const guard = await guardProjectBudget(tx, {
      projectId: input.projectId,
      at: input.startedAt,
    });
    if (guard.blocked) throw new BudgetReachedError();
    const row = await tx.timeEntry.create({
      data: {
        projectId: input.projectId,
        userId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        billable: input.billable,
        note: input.note,
        source: "manual",
        todoId: input.todoId ?? null,
      },
      include: entryInclude,
    });
    await recordTimeChange(tx, {
      ...context,
      timeEntryId: row.id,
      action: "added",
      entryUserId: row.userId,
      before: null,
      after: timeChangeSnapshot(row, row.project.client?.id ?? null),
    });
    const warning = await budgetAlertForViewer(
      { userId, projectId: input.projectId, at: input.startedAt },
      tx,
    );
    return { row, warning };
  });
  return {
    entry: toRecord(created.row),
    overlap,
    warnings: created.warning ? [created.warning] : [],
  };
}

export async function updateManualEntry(
  id: string,
  input: ManualEntryInput,
  now: Date,
  userId: string,
  change?: Partial<ChangeContext>,
  actorId = userId,
) {
  const overlap = await hasOverlap({
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    excludeId: id,
    now,
    userId,
  });
  const context = changeContext(userId, now, change);
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.timeEntry.findFirst({
      where: { id, userId },
      include: entryInclude,
    });
    if (!existing || !existing.endedAt) return null;
    if (input.todoId !== undefined) {
      const resolved = await resolveTodoForEntry(
        {
          actorId,
          projectId: input.projectId,
          todoId: input.todoId,
          currentTodoId: existing.todoId,
        },
        tx,
      );
      if (!resolved.ok) throw new TodoUnavailableError();
    }
    if (await timeEntryIsLocked(tx, existing.id)) throw new InvoicedTimeError();
    const guard = await guardProjectBudget(tx, {
      projectId: input.projectId,
      at: input.startedAt,
      excludeEntryId: existing.id,
      edit: {
        projectChanged: existing.projectId !== input.projectId,
        previous: {
          startedAt: existing.startedAt,
          endedAt: existing.endedAt,
          billable: existing.billable,
          userId: existing.userId,
        },
        next: {
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          billable: input.billable,
          userId: existing.userId,
        },
      },
    });
    if (guard.blocked) throw new BudgetReachedError();
    const row = await tx.timeEntry.update({
      where: { id },
      data: {
        projectId: input.projectId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        billable: input.billable,
        note: input.note,
        ...(input.todoId !== undefined ? { todoId: input.todoId } : {}),
      },
      include: entryInclude,
    });
    await recordTimeChange(tx, {
      ...context,
      timeEntryId: row.id,
      action: "edited",
      entryUserId: row.userId,
      before: timeChangeSnapshot(existing, existing.project.client?.id ?? null),
      after: timeChangeSnapshot(row, row.project.client?.id ?? null),
    });
    return row;
  });
  if (!updated) return null;
  return { entry: toRecord(updated), overlap };
}

export async function deleteTimeEntry(id: string, userId: string | null, change: ChangeContext) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.timeEntry.findFirst({
        where: { id, ...(userId ? { userId } : {}) },
        include: entryInclude,
      });
      if (!existing) return { ok: false as const, reason: "missing" as const };
      if (!existing.endedAt) return { ok: false as const, reason: "running" as const };
      if (await timeEntryIsLocked(tx, existing.id)) {
        return { ok: false as const, reason: "invoiced" as const };
      }
      await recordTimeChange(tx, {
        ...change,
        timeEntryId: existing.id,
        action: "deleted",
        entryUserId: existing.userId,
        before: timeChangeSnapshot(existing, existing.project.client?.id ?? null),
        after: null,
      });
      await tx.timeEntry.delete({ where: { id } });
      return { ok: true as const, entry: toRecord(existing) };
    });
  } catch (error) {
    if (isInvoicedTimeError(error)) return { ok: false as const, reason: "invoiced" as const };
    throw error;
  }
}

export async function getRunningTimer(userId: string) {
  const row = await prisma.runningTimer.findUnique({
    where: { id: userId },
    include: { timeEntry: { include: entryInclude } },
  });
  if (!row) return null;
  if (row.timeEntry.endedAt) {
    await prisma.runningTimer.delete({ where: { id: userId } }).catch(() => undefined);
    return null;
  }
  return toRecord(row.timeEntry);
}

export async function startTimer(input: {
  projectId: string;
  note: string;
  now: Date;
  userId: string;
  actorId?: string;
  source?: ChangeContext["source"];
  todoId?: string | null;
}): Promise<
  | { ok: true; timer: TimeEntryRecord; warning: string | null }
  | { ok: false; code: TimerFailureCode; timer?: TimeEntryRecord }
> {
  const projectId = input.projectId.trim();
  if (!projectId) return { ok: false, code: "project-required" };
  const note = normalizeNote(input.note);
  if (note.length > NOTE_MAX) return { ok: false, code: "note-too-long" };
  const context = changeContext(input.userId, input.now, {
    actorId: input.actorId,
    source: input.source,
  });

  try {
    const timer = await prisma.$transaction(async (tx) => {
      const running = await tx.runningTimer.findUnique({
        where: { id: input.userId },
        include: { timeEntry: { include: entryInclude } },
      });
      if (running && !running.timeEntry.endedAt) {
        return { conflict: toRecord(running.timeEntry) };
      }
      if (running) {
        await tx.runningTimer.delete({ where: { id: input.userId } });
      }

      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { archivedAt: true, billable: true },
      });
      if (!project) return { missing: true as const };
      if (project.archivedAt) return { inactive: true as const };
      const requestedTodo = input.todoId?.trim() || null;
      if (requestedTodo) {
        const resolved = await resolveTodoForEntry(
          {
            actorId: input.userId,
            projectId,
            todoId: requestedTodo,
          },
          tx,
        );
        if (!resolved.ok) return { todo: true as const };
      }
      const guard = await guardProjectBudget(tx, { projectId, at: input.now });
      if (guard.blocked) return { budget: true as const };

      const created = await tx.timeEntry.create({
        data: {
          projectId,
          userId: input.userId,
          startedAt: input.now,
          endedAt: null,
          billable: project.billable,
          note: note || null,
          source: "timer",
          todoId: input.todoId?.trim() || null,
        },
        include: entryInclude,
      });
      await tx.runningTimer.create({
        data: { id: input.userId, timeEntryId: created.id },
      });
      await recordTimeChange(tx, {
        ...context,
        timeEntryId: created.id,
        action: "started",
        entryUserId: created.userId,
        before: null,
        after: timeChangeSnapshot(created, created.project.client?.id ?? null),
      });
      const warning = await budgetAlertForViewer(
        { userId: input.userId, projectId, at: input.now },
        tx,
      );
      return { timer: toRecord(created), warning };
    });

    if ("conflict" in timer && timer.conflict) {
      return { ok: false, code: "already-running", timer: timer.conflict };
    }
    if ("missing" in timer) return { ok: false, code: "project-missing" };
    if ("inactive" in timer) return { ok: false, code: "project-inactive" };
    if ("budget" in timer) return { ok: false, code: "budget-reached" };
    if ("todo" in timer) return { ok: false, code: "todo-unavailable" };
    return { ok: true, timer: timer.timer, warning: timer.warning };
  } catch (error) {
    const running = await getRunningTimer(input.userId);
    if (running) return { ok: false, code: "already-running", timer: running };
    throw error;
  }
}

export async function stopTimer(
  now: Date,
  userId: string,
  change?: Partial<ChangeContext>,
): Promise<
  | { ok: true; entry: TimeEntryRecord; capped: boolean; overlap: boolean }
  | { ok: false; code: TimerFailureCode; timer?: TimeEntryRecord }
> {
  const context = changeContext(userId, now, change);
  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const row = await tx.runningTimer.findUnique({
        where: { id: userId },
        include: { timeEntry: { include: entryInclude } },
      });
      if (!row || row.timeEntry.endedAt) {
        if (row?.timeEntry.endedAt) {
          await tx.runningTimer.delete({ where: { id: userId } });
        }
        return { ok: false as const, code: "not-running" as const };
      }

      if (await timeEntryIsLocked(tx, row.timeEntry.id)) {
        return { ok: false as const, code: "invoiced" as const };
      }

      const elapsed = now.getTime() - row.timeEntry.startedAt.getTime();
      if (elapsed < MIN_TIMER_MS) {
        return {
          ok: false as const,
          code: "too-short" as const,
          timer: toRecord(row.timeEntry),
        };
      }

      const capped = elapsed > MAX_ENTRY_MS;
      const endedAt = capped
        ? new Date(row.timeEntry.startedAt.getTime() + MAX_ENTRY_MS)
        : now;
      const saved = await tx.timeEntry.updateMany({
        where: { id: row.timeEntry.id, endedAt: null },
        data: { endedAt },
      });
      if (saved.count !== 1) {
        return { ok: false as const, code: "not-running" as const };
      }
      await tx.runningTimer.deleteMany({
        where: { id: userId, timeEntryId: row.timeEntry.id },
      });
      const updated = await tx.timeEntry.findUniqueOrThrow({
        where: { id: row.timeEntry.id },
        include: entryInclude,
      });
      await recordTimeChange(tx, {
        ...context,
        timeEntryId: updated.id,
        action: "stopped",
        entryUserId: updated.userId,
        before: timeChangeSnapshot(row.timeEntry, row.timeEntry.project.client?.id ?? null),
        after: timeChangeSnapshot(updated, updated.project.client?.id ?? null),
      });
      return {
        ok: true as const,
        entry: toRecord(updated),
        capped,
        endedAt,
      };
    });

    if (!claimed.ok) return claimed;
    const overlap = await hasOverlap({
      startedAt: claimed.entry.startedAt,
      endedAt: claimed.endedAt,
      excludeId: claimed.entry.id,
      now,
      userId,
    });
    return {
      ok: true,
      entry: claimed.entry,
      capped: claimed.capped,
      overlap,
    };
  } catch (error) {
    if (isInvoicedTimeError(error)) return { ok: false, code: "invoiced" };
    const running = await getRunningTimer(userId);
    if (!running) return { ok: false, code: "not-running" };
    throw error;
  }
}

export async function trackedMsForProject(projectId: string) {
  return sumCompleted({ projectId });
}

export async function trackedMsForClient(clientId: string) {
  return sumCompleted({ project: { clientId } });
}

async function sumCompleted(where: {
  projectId?: string;
  project?: { clientId: string };
}) {
  const rows = await prisma.timeEntry.findMany({
    where: { endedAt: { not: null }, ...where },
    select: { startedAt: true, endedAt: true },
  });
  return rows.reduce((sum, row) => sum + durationMs({ startedAt: row.startedAt, endedAt: row.endedAt }), 0);
}
