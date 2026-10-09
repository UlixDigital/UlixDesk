import type { Client, ClientEmail } from "@prisma/client";
import type { ClientStatus } from "@/lib/client-display";
import { prisma } from "@/lib/db";
import type { NormalizedClient } from "@/lib/validation";

export type ClientRecord = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  emails: string[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const clientInclude = {
  emails: { orderBy: { position: "asc" as const } },
};

type ClientWithEmails = Client & { emails: ClientEmail[] };

function toClientRecord(row: ClientWithEmails): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    emails: [...row.emails]
      .sort((a, b) => a.position - b.position)
      .map((email) => email.email),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortClients(clients: ClientRecord[]) {
  return clients.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Name search is applied in memory so matching stays case-insensitive on SQLite.
 * Slice 1 is an internal directory, and the active or archived tab is the whole set.
 */
export async function loadClientLists(query: string) {
  const rows = await prisma.client.findMany({ include: clientInclude });
  const needle = query.trim().toLocaleLowerCase();
  const matching = needle
    ? rows.filter((row) => row.name.toLocaleLowerCase().includes(needle))
    : rows;

  return {
    active: sortClients(
      matching.filter((row) => row.archivedAt === null).map(toClientRecord),
    ),
    archived: sortClients(
      matching.filter((row) => row.archivedAt !== null).map(toClientRecord),
    ),
  };
}

export async function listClients(status: ClientStatus, query: string) {
  const lists = await loadClientLists(query);
  return lists[status];
}

/** Unfiltered directory totals. Search must not change these. */
export async function countClientsByStatus() {
  const [active, archived] = await Promise.all([
    prisma.client.count({ where: { archivedAt: null } }),
    prisma.client.count({ where: { archivedAt: { not: null } } }),
  ]);
  return { active, archived };
}

export async function getClient(id: string) {
  const row = await prisma.client.findUnique({
    where: { id },
    include: clientInclude,
  });
  return row ? toClientRecord(row) : null;
}

export async function createClient(data: NormalizedClient) {
  const created = await prisma.client.create({
    data: {
      name: data.name,
      address: data.address,
      phone: data.phone,
      emails: {
        create: data.emails.map((email, position) => ({ email, position })),
      },
    },
    include: clientInclude,
  });
  return toClientRecord(created);
}

export async function updateClient(id: string, data: NormalizedClient) {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.clientEmail.deleteMany({ where: { clientId: id } });
    return tx.client.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address,
        phone: data.phone,
        emails: {
          create: data.emails.map((email, position) => ({ email, position })),
        },
      },
      include: clientInclude,
    });
  });

  return toClientRecord(updated);
}

export async function archiveClient(id: string) {
  const existing = await prisma.client.findUnique({
    where: { id },
    include: clientInclude,
  });
  if (!existing) return null;
  if (existing.archivedAt) return toClientRecord(existing);

  const updated = await prisma.client.update({
    where: { id },
    data: { archivedAt: new Date() },
    include: clientInclude,
  });
  return toClientRecord(updated);
}

export async function restoreClient(id: string) {
  const existing = await prisma.client.findUnique({
    where: { id },
    include: clientInclude,
  });
  if (!existing) return null;
  if (!existing.archivedAt) return toClientRecord(existing);

  const updated = await prisma.client.update({
    where: { id },
    data: { archivedAt: null },
    include: clientInclude,
  });
  return toClientRecord(updated);
}
