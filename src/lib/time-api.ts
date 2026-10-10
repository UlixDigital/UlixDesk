import type { PickerProject, TimeEntryRecord } from "@/lib/time-entries";

export function serializeProject(project: PickerProject) {
  return {
    id: project.id,
    name: project.name,
    billable: project.billable,
    client: project.clientId
      ? { id: project.clientId, name: project.clientName }
      : null,
  };
}

export function serializeTimer(timer: TimeEntryRecord) {
  return {
    id: timer.id,
    projectId: timer.projectId,
    projectName: timer.project.name,
    clientName: timer.project.client?.name ?? null,
    startedAt: timer.startedAt.toISOString(),
    billable: timer.billable,
    note: timer.note,
    source: timer.source,
  };
}

export function serializeStoppedEntry(entry: TimeEntryRecord, capped: boolean) {
  const endedAt = entry.endedAt ?? entry.startedAt;
  return {
    id: entry.id,
    projectId: entry.projectId,
    projectName: entry.project.name,
    clientName: entry.project.client?.name ?? null,
    startedAt: entry.startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - entry.startedAt.getTime(),
    billable: entry.billable,
    note: entry.note,
    source: entry.source,
    capped,
  };
}
