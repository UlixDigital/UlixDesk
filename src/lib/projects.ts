import type { ProjectStatus } from "@/lib/project-display";
import type { NormalizedProject } from "@/lib/project-validation";
import { prisma } from "@/lib/db";

export type ProjectClient = {
  id: string;
  name: string;
  archivedAt: Date | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  billable: boolean;
  clientId: string | null;
  client: ProjectClient | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientChoice = {
  id: string;
  name: string;
  archivedAt: Date | null;
};

export type ClientProjectSummary = {
  id: string;
  name: string;
  archivedAt: Date | null;
};

const projectInclude = {
  client: {
    select: { id: true, name: true, archivedAt: true },
  },
} as const;

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  billable: boolean;
  clientId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  client: ProjectClient | null;
};

function toProjectRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    billable: row.billable,
    clientId: row.clientId,
    client: row.client,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortByName<T extends { id: string; name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Name search and the client filter run in memory so matching stays
 * case-insensitive on SQLite. Tab totals are counted separately.
 */
export async function loadProjectLists(query: string, clientId: string) {
  const rows = await prisma.project.findMany({ include: projectInclude });
  const needle = query.trim().toLocaleLowerCase();
  const matching = rows.filter((row) => {
    if (clientId && row.clientId !== clientId) return false;
    if (needle && !row.name.toLocaleLowerCase().includes(needle)) return false;
    return true;
  });

  return {
    active: sortByName(
      matching.filter((row) => row.archivedAt === null).map(toProjectRecord),
    ),
    archived: sortByName(
      matching.filter((row) => row.archivedAt !== null).map(toProjectRecord),
    ),
  };
}

export async function listProjects(
  status: ProjectStatus,
  query: string,
  clientId = "",
) {
  const lists = await loadProjectLists(query, clientId);
  return lists[status];
}

/** Unfiltered directory totals. Search and the client filter must not change these. */
export async function countProjectsByStatus() {
  const [active, archived] = await Promise.all([
    prisma.project.count({ where: { archivedAt: null } }),
    prisma.project.count({ where: { archivedAt: { not: null } } }),
  ]);
  return { active, archived };
}

export async function getProject(id: string) {
  const row = await prisma.project.findUnique({
    where: { id },
    include: projectInclude,
  });
  return row ? toProjectRecord(row) : null;
}

export async function createProject(data: NormalizedProject) {
  const created = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      billable: data.billable,
      clientId: data.clientId,
    },
    include: projectInclude,
  });
  return toProjectRecord(created);
}

export async function updateProject(id: string, data: NormalizedProject) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      billable: data.billable,
      clientId: data.clientId,
    },
    include: projectInclude,
  });
  return toProjectRecord(updated);
}

export async function archiveProject(id: string) {
  const existing = await prisma.project.findUnique({
    where: { id },
    include: projectInclude,
  });
  if (!existing) return null;
  if (existing.archivedAt) return toProjectRecord(existing);

  const updated = await prisma.project.update({
    where: { id },
    data: { archivedAt: new Date() },
    include: projectInclude,
  });
  return toProjectRecord(updated);
}

export async function restoreProject(id: string) {
  const existing = await prisma.project.findUnique({
    where: { id },
    include: projectInclude,
  });
  if (!existing) return null;
  if (!existing.archivedAt) return toProjectRecord(existing);

  const updated = await prisma.project.update({
    where: { id },
    data: { archivedAt: null },
    include: projectInclude,
  });
  return toProjectRecord(updated);
}

/**
 * Active clients, plus the project's current client when that client is archived.
 * Other archived clients stay out of the picker.
 */
export async function listClientChoices(currentClientId: string | null) {
  const rows = await prisma.client.findMany({
    where: currentClientId
      ? { OR: [{ archivedAt: null }, { id: currentClientId }] }
      : { archivedAt: null },
    select: { id: true, name: true, archivedAt: true },
  });
  return sortByName(rows);
}

/** Every client, including archived ones, for the list filter. */
export async function listClientsForFilter() {
  const rows = await prisma.client.findMany({
    select: { id: true, name: true, archivedAt: true },
  });
  return sortByName(rows);
}

export async function listProjectsForClient(clientId: string) {
  const rows = await prisma.project.findMany({
    where: { clientId },
    select: { id: true, name: true, archivedAt: true },
  });
  return [...rows].sort((a, b) => {
    const aArchived = a.archivedAt ? 1 : 0;
    const bArchived = b.archivedAt ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

export async function clientAssignmentError(
  clientId: string | null,
  currentClientId: string | null,
) {
  if (!clientId) return null;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { archivedAt: true },
  });
  if (!client) return "That client no longer exists.";
  if (client.archivedAt && clientId !== currentClientId) {
    return "Choose an active client, or leave this blank.";
  }
  return null;
}
