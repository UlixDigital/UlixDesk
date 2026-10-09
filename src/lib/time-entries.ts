import { prisma } from "@/lib/db";
import {
  MAX_ENTRY_MS,
  MIN_TIMER_MS,
  NOTE_MAX,
  type TimerFailureCode,
} from "@/lib/time-copy";
import type { TimesheetEntry } from "@/lib/timesheet";
import { intervalsOverlap } from "@/lib/time-validation";

/**
 * One running timer for the workspace until accounts exist.
 * Later, use the signed-in user's id here and set TimeEntry.userId to the same value.
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
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    billable: row.billable,
    note: row.note,
    source: row.source,
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

export async function getTimeEntry(id: string) {
  const row = await prisma.timeEntry.findFirst({
    where: { id, userId: null },
    include: entryInclude,
  });
  return row ? toRecord(row) : null;
}

export async function listEntriesOverlapping(input: {
  rangeStart: Date;
  rangeEnd: Date;
  projectId?: string;
  clientId?: string;
}) {
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId: null,
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
export async function listOverlapCandidates(now: Date): Promise<OverlapCandidate[]> {
  const rows = await prisma.timeEntry.findMany({
    where: { userId: null },
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
}) {
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId: null,
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

export async function createManualEntry(input: ManualEntryInput, now: Date) {
  const overlap = await hasOverlap({
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    now,
  });
  const created = await prisma.timeEntry.create({
    data: {
      projectId: input.projectId,
      userId: null,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      billable: input.billable,
      note: input.note,
      source: "manual",
    },
    include: entryInclude,
  });
  return { entry: toRecord(created), overlap };
}

export async function updateManualEntry(
  id: string,
  input: ManualEntryInput,
  now: Date,
) {
  const existing = await prisma.timeEntry.findFirst({
    where: { id, userId: null },
  });
  if (!existing || !existing.endedAt) return null;
  const overlap = await hasOverlap({
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    excludeId: id,
    now,
  });
  const updated = await prisma.timeEntry.update({
    where: { id },
    data: {
      projectId: input.projectId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      billable: input.billable,
      note: input.note,
    },
    include: entryInclude,
  });
  return { entry: toRecord(updated), overlap };
}

export async function deleteTimeEntry(id: string) {
  const existing = await getTimeEntry(id);
  if (!existing || !existing.endedAt) return null;
  await prisma.timeEntry.delete({ where: { id } });
  return existing;
}

export async function getRunningTimer() {
  const row = await prisma.runningTimer.findUnique({
    where: { id: WORKSPACE_TIMER_ID },
    include: { timeEntry: { include: entryInclude } },
  });
  if (!row) return null;
  if (row.timeEntry.endedAt) {
    await prisma.runningTimer.delete({ where: { id: WORKSPACE_TIMER_ID } }).catch(() => undefined);
    return null;
  }
  return toRecord(row.timeEntry);
}

export async function startTimer(input: {
  projectId: string;
  note: string;
  now: Date;
}): Promise<
  | { ok: true; timer: TimeEntryRecord }
  | { ok: false; code: TimerFailureCode; timer?: TimeEntryRecord }
> {
  const projectId = input.projectId.trim();
  if (!projectId) return { ok: false, code: "project-required" };
  const note = input.note.trim();
  if (note.length > NOTE_MAX) return { ok: false, code: "note-too-long" };

  try {
    const timer = await prisma.$transaction(async (tx) => {
      const running = await tx.runningTimer.findUnique({
        where: { id: WORKSPACE_TIMER_ID },
        include: { timeEntry: { include: entryInclude } },
      });
      if (running && !running.timeEntry.endedAt) {
        return { conflict: toRecord(running.timeEntry) };
      }
      if (running) {
        await tx.runningTimer.delete({ where: { id: WORKSPACE_TIMER_ID } });
      }

      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { archivedAt: true, billable: true },
      });
      if (!project || project.archivedAt) return { inactive: true as const };

      const created = await tx.timeEntry.create({
        data: {
          projectId,
          userId: null,
          startedAt: input.now,
          endedAt: null,
          billable: project.billable,
          note: note || null,
          source: "timer",
        },
        include: entryInclude,
      });
      await tx.runningTimer.create({
        data: { id: WORKSPACE_TIMER_ID, timeEntryId: created.id },
      });
      return { timer: toRecord(created) };
    });

    if ("conflict" in timer && timer.conflict) {
      return { ok: false, code: "already-running", timer: timer.conflict };
    }
    if ("inactive" in timer) return { ok: false, code: "project-inactive" };
    return { ok: true, timer: timer.timer };
  } catch (error) {
    const running = await getRunningTimer();
    if (running) return { ok: false, code: "already-running", timer: running };
    throw error;
  }
}

export async function stopTimer(now: Date): Promise<
  | { ok: true; entry: TimeEntryRecord; capped: boolean; overlap: boolean }
  | { ok: false; code: TimerFailureCode; timer?: TimeEntryRecord }
> {
  const running = await getRunningTimer();
  if (!running) return { ok: false, code: "not-running" };

  const elapsed = now.getTime() - running.startedAt.getTime();
  if (elapsed < MIN_TIMER_MS) {
    return { ok: false, code: "too-short", timer: running };
  }

  const capped = elapsed > MAX_ENTRY_MS;
  const endedAt = capped
    ? new Date(running.startedAt.getTime() + MAX_ENTRY_MS)
    : now;
  const overlap = await hasOverlap({
    startedAt: running.startedAt,
    endedAt,
    excludeId: running.id,
    now,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.runningTimer.deleteMany({ where: { timeEntryId: running.id } });
    return tx.timeEntry.update({
      where: { id: running.id },
      data: { endedAt },
      include: entryInclude,
    });
  });

  return { ok: true, entry: toRecord(updated), capped, overlap };
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
    where: { userId: null, endedAt: { not: null }, ...where },
    select: { startedAt: true, endedAt: true },
  });
  return rows.reduce((sum, row) => sum + durationMs({ startedAt: row.startedAt, endedAt: row.endedAt }), 0);
}
