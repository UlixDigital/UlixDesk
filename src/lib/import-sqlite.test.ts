import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";
import { importPhase1Database } from "../../scripts/import-sqlite.mjs";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Phase 1 SQLite import", () => {
  it("prints counts on a dry run and writes nothing", async () => {
    const owner = await createTestUser("owner", "import-owner@ulix.test");
    const file = writePhase1({
      clients: 1,
      projects: 1,
      entries: 2,
      timer: true,
      tokens: 3,
    });

    const result = await importPhase1Database({ prisma, sourcePath: file, dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("dry-run");
    expect(result.message).toBe("Dry run. Nothing was written.");
    expect(result.counts).toMatchObject({
      clients: 1,
      projects: 1,
      timeEntries: 2,
      runningTimers: 1,
      droppedTokens: 3,
    });
    expect(await prisma.client.count()).toBe(0);
    expect(await prisma.timeEntry.count()).toBe(0);
    expect(await prisma.accessToken.count()).toBe(0);
    expect(owner.id).toBeTruthy();
  });

  it("assigns imported time to the owner and drops extension tokens", async () => {
    const owner = await createTestUser("owner", "import-owner@ulix.test");
    const file = writePhase1({
      clients: 1,
      projects: 1,
      entries: 1,
      timer: true,
      tokens: 2,
    });

    const result = await importPhase1Database({ prisma, sourcePath: file });
    expect(result.status).toBe("imported");
    expect(result.wrote).toBe(true);

    const entry = await prisma.timeEntry.findFirstOrThrow();
    expect(entry.userId).toBe(owner.id);
    const timer = await prisma.runningTimer.findUniqueOrThrow({ where: { id: owner.id } });
    expect(timer.timeEntryId).toBe(entry.id);
    expect(await prisma.accessToken.count()).toBe(0);

    const again = await importPhase1Database({ prisma, sourcePath: file });
    expect(again.status).toBe("already");
    expect(again.wrote).toBe(false);
    expect(await prisma.timeEntry.count()).toBe(1);
    expect(await prisma.client.count()).toBe(1);
  });

  it("refuses a target that already has different data", async () => {
    await createTestUser("owner", "import-owner@ulix.test");
    await prisma.client.create({ data: { name: "Already here" } });
    const file = writePhase1({ clients: 1, projects: 0, entries: 0, timer: false, tokens: 0 });

    const result = await importPhase1Database({ prisma, sourcePath: file, dryRun: true });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("refused");
    expect(await prisma.client.count()).toBe(1);
    expect(await prisma.client.findFirstOrThrow()).toMatchObject({ name: "Already here" });
  });
});

function writePhase1(input: {
  clients: number;
  projects: number;
  entries: number;
  timer: boolean;
  tokens: number;
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ulixdesk-phase1-"));
  const file = path.join(dir, "phase1.db");
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE "Client" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "address" TEXT,
      "phone" TEXT,
      "archivedAt" DATETIME,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE "ClientEmail" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "clientId" TEXT NOT NULL
    );
    CREATE TABLE "Project" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "billable" BOOLEAN NOT NULL,
      "clientId" TEXT,
      "archivedAt" DATETIME,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE "TimeEntry" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "userId" TEXT,
      "startedAt" DATETIME NOT NULL,
      "endedAt" DATETIME,
      "billable" BOOLEAN NOT NULL,
      "note" TEXT,
      "source" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE "RunningTimer" (
      "id" TEXT PRIMARY KEY,
      "timeEntryId" TEXT NOT NULL
    );
    CREATE TABLE "AccessToken" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL,
      "lastUsedAt" DATETIME,
      "revokedAt" DATETIME
    );
  `);
  const now = "2026-10-01T09:00:00.000Z";
  for (let index = 0; index < input.clients; index += 1) {
    db.prepare(
      'INSERT INTO "Client" (id, name, address, phone, archivedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(`client-${index}`, "Acme", null, null, null, now, now);
    db.prepare('INSERT INTO "ClientEmail" (id, email, position, clientId) VALUES (?, ?, ?, ?)').run(
      `email-${index}`,
      "acme@example.com",
      0,
      `client-${index}`,
    );
  }
  for (let index = 0; index < input.projects; index += 1) {
    db.prepare(
      'INSERT INTO "Project" (id, name, description, billable, clientId, archivedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      `project-${index}`,
      "Website",
      null,
      1,
      input.clients > 0 ? "client-0" : null,
      null,
      now,
      now,
    );
  }
  for (let index = 0; index < input.entries; index += 1) {
    db.prepare(
      'INSERT INTO "TimeEntry" (id, projectId, userId, startedAt, endedAt, billable, note, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      `entry-${index}`,
      "project-0",
      null,
      now,
      input.timer && index === input.entries - 1 ? null : "2026-10-01T10:00:00.000Z",
      1,
      null,
      "manual",
      now,
      now,
    );
  }
  if (input.timer) {
    db.prepare('INSERT INTO "RunningTimer" (id, timeEntryId) VALUES (?, ?)').run(
      "workspace",
      `entry-${input.entries - 1}`,
    );
  }
  for (let index = 0; index < input.tokens; index += 1) {
    db.prepare(
      'INSERT INTO "AccessToken" (id, name, tokenHash, createdAt, lastUsedAt, revokedAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(`token-${index}`, "Laptop", `hash-${index}`, now, null, null);
  }
  db.close();
  return file;
}
