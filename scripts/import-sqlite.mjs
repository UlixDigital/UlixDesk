import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

loadEnvFile(new URL("../.env", import.meta.url));

const REQUIRED_TABLES = ["Client", "ClientEmail", "Project", "TimeEntry", "RunningTimer"];

/**
 * Copy a Phase 1 SQLite file into the current Postgres database.
 * Every time row is assigned to the earliest active owner.
 * Extension tokens in the old file are counted and not copied.
 * A second run with the same file does nothing. A target that already has
 * different clients, projects, or time is refused.
 */
export async function importPhase1Database({ prisma, sourcePath, dryRun = false }) {
  const source = readPhase1Sqlite(sourcePath);
  const owner = await prisma.user.findFirst({
    where: { role: "owner", deactivatedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) {
    return {
      ok: false,
      status: "no-owner",
      message: "No active owner yet. Run npm run user:bootstrap first.",
      counts: source.counts,
    };
  }

  const target = await readTarget(prisma);
  if (!targetIsEmpty(target) && !sameAsSource(target, source, owner.id)) {
    return {
      ok: false,
      status: "refused",
      message:
        "Refusing to import. Postgres already has clients, projects, or time entries that are not in this file.",
      counts: source.counts,
      ownerEmail: owner.email,
    };
  }

  if (sameAsSource(target, source, owner.id)) {
    const empty = source.counts.clients === 0 && source.counts.timeEntries === 0;
    return {
      ok: true,
      status: "already",
      message: empty
        ? "Nothing to import."
        : "Already imported. Nothing was written.",
      counts: source.counts,
      ownerEmail: owner.email,
      wrote: false,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      status: "dry-run",
      message: "Dry run. Nothing was written.",
      counts: source.counts,
      ownerEmail: owner.email,
      wrote: false,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const client of source.clients) {
      await tx.client.create({
        data: {
          id: client.id,
          name: client.name,
          address: client.address,
          phone: client.phone,
          archivedAt: client.archivedAt,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
        },
      });
    }
    for (const email of source.emails) {
      await tx.clientEmail.create({
        data: {
          id: email.id,
          email: email.email,
          position: email.position,
          clientId: email.clientId,
        },
      });
    }
    for (const project of source.projects) {
      await tx.project.create({
        data: {
          id: project.id,
          name: project.name,
          description: project.description,
          billable: project.billable,
          clientId: project.clientId,
          archivedAt: project.archivedAt,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      });
    }
    for (const entry of source.entries) {
      await tx.timeEntry.create({
        data: {
          id: entry.id,
          projectId: entry.projectId,
          userId: owner.id,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
          billable: entry.billable,
          note: entry.note,
          source: entry.source,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
      });
    }
    if (source.timer) {
      await tx.runningTimer.create({
        data: { id: owner.id, timeEntryId: source.timer.timeEntryId },
      });
    }
  });

  return {
    ok: true,
    status: "imported",
    message: `Imported into ${owner.email}. Create new extension tokens after signing in. The old tokens were not copied.`,
    counts: source.counts,
    ownerEmail: owner.email,
    wrote: true,
  };
}

export function readPhase1Sqlite(sourcePath) {
  let db;
  try {
    db = new DatabaseSync(sourcePath, { readOnly: true });
  } catch (error) {
    throw new Error(`Could not open ${sourcePath}. ${error instanceof Error ? error.message : ""}`.trim());
  }
  try {
    for (const name of REQUIRED_TABLES) {
      if (!tableExists(db, name)) {
        throw new Error(`This file does not look like a Phase 1 UlixDesk database. Missing table ${name}.`);
      }
    }
    const clients = db.prepare('SELECT * FROM "Client"').all().map(mapClient);
    const emails = db.prepare('SELECT * FROM "ClientEmail"').all().map(mapEmail);
    const projects = db.prepare('SELECT * FROM "Project"').all().map(mapProject);
    const entries = db.prepare('SELECT * FROM "TimeEntry"').all().map(mapEntry);
    const timers = db.prepare('SELECT * FROM "RunningTimer"').all().map((row) => ({
      id: String(row.id),
      timeEntryId: String(row.timeEntryId),
    }));
    if (timers.length > 1) {
      throw new Error("The Phase 1 file has more than one running timer.");
    }
    const tokens = tableExists(db, "AccessToken") ? db.prepare('SELECT id FROM "AccessToken"').all() : [];
    return {
      clients,
      emails,
      projects,
      entries,
      timer: timers[0] ?? null,
      counts: {
        clients: clients.length,
        clientEmails: emails.length,
        projects: projects.length,
        timeEntries: entries.length,
        runningTimers: timers.length,
        droppedTokens: tokens.length,
      },
    };
  } finally {
    db.close();
  }
}

function tableExists(db, name) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function mapClient(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    address: textOrNull(row.address),
    phone: textOrNull(row.phone),
    archivedAt: parseDate(row.archivedAt),
    createdAt: parseDate(row.createdAt) ?? new Date(),
    updatedAt: parseDate(row.updatedAt) ?? new Date(),
  };
}

function mapEmail(row) {
  return {
    id: String(row.id),
    email: String(row.email),
    position: Number(row.position ?? 0),
    clientId: String(row.clientId),
  };
}

function mapProject(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    description: textOrNull(row.description),
    billable: parseBool(row.billable),
    clientId: textOrNull(row.clientId),
    archivedAt: parseDate(row.archivedAt),
    createdAt: parseDate(row.createdAt) ?? new Date(),
    updatedAt: parseDate(row.updatedAt) ?? new Date(),
  };
}

function mapEntry(row) {
  const startedAt = parseDate(row.startedAt);
  if (!startedAt) throw new Error(`Time entry ${row.id} has no start time.`);
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    startedAt,
    endedAt: parseDate(row.endedAt),
    billable: parseBool(row.billable),
    note: textOrNull(row.note),
    source: String(row.source),
    createdAt: parseDate(row.createdAt) ?? startedAt,
    updatedAt: parseDate(row.updatedAt) ?? startedAt,
  };
}

function textOrNull(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function parseBool(value) {
  return value === true || value === 1 || value === "1";
}

function parseDate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "bigint") return new Date(Number(value));
  if (typeof value === "number") return new Date(value);
  const text = String(value);
  const date = new Date(/^\d+$/.test(text) ? Number(text) : text.includes("T") ? text : text.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) throw new Error(`Unreadable date: ${text}`);
  return date;
}

async function readTarget(prisma) {
  const [clients, emails, projects, entries, timers] = await Promise.all([
    prisma.client.findMany({ select: { id: true } }),
    prisma.clientEmail.findMany({ select: { id: true } }),
    prisma.project.findMany({ select: { id: true } }),
    prisma.timeEntry.findMany({ select: { id: true, userId: true } }),
    prisma.runningTimer.findMany({ select: { id: true, timeEntryId: true } }),
  ]);
  return { clients, emails, projects, entries, timers };
}

function targetIsEmpty(target) {
  return (
    target.clients.length === 0 &&
    target.emails.length === 0 &&
    target.projects.length === 0 &&
    target.entries.length === 0 &&
    target.timers.length === 0
  );
}

function sameAsSource(target, source, ownerId) {
  if (!sameIdSet(target.clients, source.clients)) return false;
  if (!sameIdSet(target.emails, source.emails)) return false;
  if (!sameIdSet(target.projects, source.projects)) return false;
  if (!sameIdSet(target.entries, source.entries)) return false;
  if (source.entries.some((entry) => {
    const row = target.entries.find((item) => item.id === entry.id);
    return row?.userId !== ownerId;
  })) {
    return false;
  }
  if (!source.timer) return target.timers.length === 0;
  return (
    target.timers.length === 1 &&
    target.timers[0].id === ownerId &&
    target.timers[0].timeEntryId === source.timer.timeEntryId
  );
}

function sameIdSet(targetRows, sourceRows) {
  if (targetRows.length !== sourceRows.length) return false;
  const ids = new Set(targetRows.map((row) => row.id));
  return sourceRows.every((row) => ids.has(row.id));
}

function printResult(result) {
  const counts = result.counts;
  if (counts) {
    console.log(`Clients: ${counts.clients}`);
    console.log(`Client emails: ${counts.clientEmails}`);
    console.log(`Projects: ${counts.projects}`);
    console.log(`Time entries: ${counts.timeEntries}`);
    console.log(`Running timers: ${counts.runningTimers}`);
    console.log(`Extension tokens dropped: ${counts.droppedTokens}`);
  }
  if (result.ownerEmail) console.log(`Owner: ${result.ownerEmail}`);
  console.log(result.message);
}

function loadEnvFile(url) {
  let text = "";
  try {
    text = readFileSync(url, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  let sourcePath = "";
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--from") {
      sourcePath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${arg}. Use --from <path> and optional --dry-run.`);
  }
  if (!sourcePath) throw new Error("Pass the Phase 1 database with --from <path>.");
  return { sourcePath, dryRun };
}

const isDirectRun = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href,
);
if (isDirectRun) {
  try {
    const { sourcePath, dryRun } = parseArgs(process.argv.slice(2));
    const prisma = new PrismaClient();
    try {
      const result = await importPhase1Database({ prisma, sourcePath, dryRun });
      printResult(result);
      if (!result.ok) process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
