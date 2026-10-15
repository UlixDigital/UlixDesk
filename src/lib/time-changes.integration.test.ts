import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as startRoute } from "@/app/api/timer/start/route";
import { createAccessToken } from "@/lib/access-tokens";
import { createClient } from "@/lib/clients";
import { prisma } from "@/lib/db";
import { createExtensionSession } from "@/lib/extension-session";
import { createProject } from "@/lib/projects";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createSession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { createTestUser } from "@/lib/test-actor";
import { listTimeChanges, parseChangeAction, parsePage, scopedEntryUserId } from "@/lib/time-changes";
import {
  createManualEntry,
  deleteTimeEntry,
  startTimer,
  stopTimer,
  updateManualEntry,
} from "@/lib/time-entries";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

let samId = "";
let janeId = "";

beforeEach(async () => {
  await resetTestDatabase();
  samId = (await createTestUser("member", "sam@ulix.test")).id;
  await prisma.user.update({ where: { id: samId }, data: { name: "Sam" } });
  janeId = (await createTestUser("admin", "jane@ulix.test")).id;
  await prisma.user.update({ where: { id: janeId }, data: { name: "Jane" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function website() {
  const client = await createClient({
    name: "Acme",
    address: null,
    phone: null,
    emails: [],
  });
  const project = await createProject({
    name: "Website",
    description: null,
    clientId: client.id,
    billable: true,
  });
  return { client, project };
}

const now = new Date("2026-10-15T08:00:00.000Z");

describe("time change log", () => {
  it("logs add, edit, and delete in the same transaction and keeps the row", async () => {
    const { client, project } = await website();
    const other = await createProject({
      name: "Brochure",
      description: null,
      clientId: client.id,
      billable: true,
    });
    const created = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T03:30:00.000Z"),
        endedAt: new Date("2026-10-15T04:30:00.000Z"),
        billable: true,
        note: "Draft",
      },
      now,
      samId,
      { actorId: samId, source: "web", changedAt: now },
    );
    const editedAt = new Date("2026-10-15T09:00:00.000Z");
    const updated = await updateManualEntry(
      created.entry.id,
      {
        projectId: other.id,
        startedAt: new Date("2026-10-15T03:30:00.000Z"),
        endedAt: new Date("2026-10-15T05:00:00.000Z"),
        billable: false,
        note: "Called the client",
      },
      editedAt,
      samId,
      { actorId: janeId, source: "web", changedAt: editedAt },
    );
    expect(updated).not.toBeNull();
    const deleted = await deleteTimeEntry(created.entry.id, null, {
      actorId: janeId,
      source: "web",
      changedAt: new Date("2026-10-15T10:00:00.000Z"),
    });
    expect(deleted.ok).toBe(true);
    expect(await prisma.timeEntry.count()).toBe(0);

    const rows = await prisma.timeChange.findMany({ orderBy: { changedAt: "asc" } });
    expect(rows.map((row) => row.action)).toEqual(["added", "edited", "deleted"]);
    expect(rows.every((row) => row.timeEntryId === created.entry.id)).toBe(true);
    expect(rows[0]?.beforeStartedAt).toBeNull();
    expect(rows[0]?.afterProjectId).toBe(project.id);
    expect(rows[0]?.afterClientId).toBe(client.id);
    expect(rows[0]?.afterNote).toBe("Draft");
    expect(rows[0]?.afterBillable).toBe(true);
    expect(rows[1]?.beforeProjectId).toBe(project.id);
    expect(rows[1]?.afterProjectId).toBe(other.id);
    expect(rows[1]?.actorId).toBe(janeId);
    expect(rows[1]?.entryUserId).toBe(samId);
    expect(rows[2]?.afterStartedAt).toBeNull();
    expect(rows[2]?.beforeNote).toBe("Called the client");

    const listed = await listTimeChanges({
      actor: { id: janeId, role: "admin" },
      from: zonedDayStart("2026-10-15", "Asia/Colombo"),
      to: zonedDayEnd("2026-10-15", "Asia/Colombo"),
      timeZone: "Asia/Colombo",
      memberId: null,
      clientId: null,
      projectId: null,
      action: null,
      page: 1,
    });
    expect(listed.total).toBe(3);
    expect(listed.items[0]?.byline).toBe("Deleted by Jane for Sam");
    expect(listed.items[0]?.forOther).toBe(true);
    expect(JSON.stringify(listed.items)).not.toMatch(/amountMinor|currency/);
    const byProject = await listTimeChanges({
      actor: { id: janeId, role: "admin" },
      from: zonedDayStart("2026-10-15", "Asia/Colombo"),
      to: zonedDayEnd("2026-10-15", "Asia/Colombo"),
      timeZone: "Asia/Colombo",
      memberId: null,
      clientId: client.id,
      projectId: project.id,
      action: null,
      page: 1,
    });
    expect(byProject.total).toBe(2);
    expect(byProject.items.map((item) => item.action).sort()).toEqual(["added", "edited"]);

    const sam = await listTimeChanges({
      actor: { id: samId, role: "member" },
      from: zonedDayStart("2026-10-12", "Asia/Colombo"),
      to: zonedDayEnd("2026-10-18", "Asia/Colombo"),
      timeZone: "Asia/Colombo",
      memberId: janeId,
      clientId: null,
      projectId: null,
      action: "edited",
      page: 1,
    });
    expect(sam.items).toHaveLength(1);
    expect(sam.items[0]?.byline).toBe("Edited by Jane for Sam");
    expect(scopedEntryUserId({ id: samId, role: "member" }, janeId)).toBe(samId);
  });

  it("logs timer start and stop from web, extension, and API, and rolls back together", async () => {
    const { project } = await website();
    const started = await startTimer({
      userId: samId,
      projectId: project.id,
      note: "Focus",
      now: new Date("2026-10-15T03:30:00.000Z"),
      source: "extension",
    });
    expect(started.ok).toBe(true);
    const tooSoon = await stopTimer(new Date("2026-10-15T03:30:00.400Z"), samId, {
      source: "extension",
    });
    expect(tooSoon.ok).toBe(false);
    const stopped = await stopTimer(new Date("2026-10-15T04:30:00.000Z"), samId, {
      source: "extension",
      changedAt: new Date("2026-10-15T04:30:00.000Z"),
    });
    expect(stopped.ok).toBe(true);

    const rows = await prisma.timeChange.findMany({ orderBy: { changedAt: "asc" } });
    expect(rows.map((row) => `${row.action}:${row.source}`)).toEqual([
      "started:extension",
      "stopped:extension",
    ]);
    expect(rows[0]?.afterEndedAt).toBeNull();
    expect(rows[0]?.afterDurationMs).toBeNull();
    expect(rows[1]?.beforeEndedAt).toBeNull();
    expect(rows[1]?.afterDurationMs).toBe(3_600_000);
    expect(rows[1]?.afterNote).toBe("Focus");

    await expect(
      createManualEntry(
        {
          projectId: project.id,
          startedAt: new Date("2026-10-15T06:00:00.000Z"),
          endedAt: new Date("2026-10-15T07:00:00.000Z"),
          billable: true,
          note: null,
        },
        now,
        samId,
        { actorId: "missing-actor", source: "api", changedAt: now },
      ),
    ).rejects.toThrow();
    expect(await prisma.timeEntry.count()).toBe(1);
    expect(await prisma.timeChange.count({ where: { action: "added" } })).toBe(0);

    const archived = await createProject({
      name: "Old",
      description: null,
      clientId: null,
      billable: true,
    });
    await prisma.project.update({
      where: { id: archived.id },
      data: { archivedAt: new Date() },
    });
    const before = await prisma.timeChange.count();
    const refused = await startTimer({
      userId: janeId,
      projectId: archived.id,
      note: "",
      now,
      source: "api",
    });
    expect(refused.ok).toBe(false);
    expect(await prisma.timeChange.count()).toBe(before);
  });

  it("records the route credential as web, extension, or API", async () => {
    const { project } = await website();
    const session = await createSession(samId);
    const access = await createAccessToken("Script", janeId);
    const extension = await createExtensionSession({ userId: janeId, label: "Chrome" });

    const cookieStart = await startRoute(
      new Request("http://localhost/api/timer/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${session.cookie}`,
        },
        body: JSON.stringify({ projectId: project.id }),
      }),
    );
    expect(cookieStart.status).toBe(201);
    await stopTimer(new Date(Date.now() + 2000), samId, { source: "web" });

    const apiStart = await startRoute(
      new Request("http://localhost/api/timer/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${access.token}`,
        },
        body: JSON.stringify({ projectId: project.id }),
      }),
    );
    expect(apiStart.status).toBe(201);
    await stopTimer(new Date(Date.now() + 5000), janeId, { source: "api" });

    const extensionStart = await startRoute(
      new Request("http://localhost/api/timer/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${extension.accessToken}`,
        },
        body: JSON.stringify({ projectId: project.id, note: "From Chrome" }),
      }),
    );
    expect(extensionStart.status).toBe(201);

    const sources = await prisma.timeChange.findMany({
      where: { action: "started" },
      select: { source: true, entryUserId: true },
    });
    expect(sources).toHaveLength(3);
    expect(sources).toEqual(
      expect.arrayContaining([
        { source: "web", entryUserId: samId },
        { source: "api", entryUserId: janeId },
        { source: "extension", entryUserId: janeId },
      ]),
    );
  });

  it("filters by workspace date, client, action, and page, and rejects updates", async () => {
    const { client, project } = await website();
    const inside = new Date("2026-10-15T20:00:00.000Z");
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T03:30:00.000Z"),
        endedAt: new Date("2026-10-15T04:00:00.000Z"),
        billable: true,
        note: "Late UTC",
      },
      inside,
      samId,
      { changedAt: inside },
    );
    const early = new Date("2026-10-14T19:00:00.000Z");
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-14T03:30:00.000Z"),
        endedAt: new Date("2026-10-14T04:00:00.000Z"),
        billable: true,
        note: "Previous day",
      },
      early,
      samId,
      { changedAt: early },
    );

    const colomboDay = await listTimeChanges({
      actor: { id: janeId, role: "owner" },
      from: zonedDayStart("2026-10-16", "Asia/Colombo"),
      to: zonedDayEnd("2026-10-16", "Asia/Colombo"),
      timeZone: "Asia/Colombo",
      memberId: samId,
      clientId: client.id,
      projectId: null,
      action: "added",
      page: 1,
    });
    expect(colomboDay.items.map((item) => item.fields.find((field) => field.label === "Notes")?.after)).toEqual([
      "Late UTC",
    ]);

    const previous = await listTimeChanges({
      actor: { id: janeId, role: "owner" },
      from: zonedDayStart("2026-10-15", "Asia/Colombo"),
      to: zonedDayEnd("2026-10-15", "Asia/Colombo"),
      timeZone: "Asia/Colombo",
      memberId: null,
      clientId: null,
      projectId: null,
      action: null,
      page: 1,
      pageSize: 1,
    });
    expect(previous.total).toBe(1);
    expect(previous.pageCount).toBe(1);

    const paged = await listTimeChanges({
      actor: { id: janeId, role: "admin" },
      from: zonedDayStart("2026-10-01", "UTC"),
      to: zonedDayEnd("2026-10-31", "UTC"),
      timeZone: "UTC",
      memberId: null,
      clientId: null,
      projectId: null,
      action: null,
      page: 2,
      pageSize: 1,
    });
    expect(paged.total).toBe(2);
    expect(paged.page).toBe(2);
    expect(paged.items).toHaveLength(1);
    expect(parseChangeAction("timer")).toBe("timer");
    expect(parseChangeAction("nope")).toBeNull();
    expect(parsePage("0")).toBe(1);

    const id = (await prisma.timeChange.findFirstOrThrow()).id;
    await expect(
      prisma.timeChange.update({ where: { id }, data: { action: "added" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.timeChange.delete({ where: { id } })).rejects.toThrow(/append-only/);
    expect(await prisma.timeChange.count()).toBe(2);
  });

  it("hides another member's changes and timer rows behind the timer filter", async () => {
    const { project } = await website();
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T03:30:00.000Z"),
        endedAt: new Date("2026-10-15T04:00:00.000Z"),
        billable: true,
        note: "Sam only",
      },
      now,
      samId,
    );
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T05:00:00.000Z"),
        endedAt: new Date("2026-10-15T06:00:00.000Z"),
        billable: true,
        note: "Jane only",
      },
      now,
      janeId,
    );
    await startTimer({
      userId: samId,
      projectId: project.id,
      note: "",
      now: new Date("2026-10-15T07:00:00.000Z"),
      source: "web",
    });

    const member = await listTimeChanges({
      actor: { id: samId, role: "member" },
      from: zonedDayStart("2026-10-01", "UTC"),
      to: zonedDayEnd("2026-10-31", "UTC"),
      timeZone: "UTC",
      memberId: null,
      clientId: null,
      projectId: null,
      action: null,
      page: 1,
    });
    expect(member.items.every((item) => item.byline.includes("Sam"))).toBe(true);
    expect(JSON.stringify(member.items)).not.toContain("Jane only");
    expect(JSON.stringify(member.items)).not.toMatch(/USD|amountMinor|currency/);

    const timer = await listTimeChanges({
      actor: { id: janeId, role: "admin" },
      from: zonedDayStart("2026-10-01", "UTC"),
      to: zonedDayEnd("2026-10-31", "UTC"),
      timeZone: "UTC",
      memberId: samId,
      clientId: null,
      projectId: null,
      action: "timer",
      page: 1,
    });
    expect(timer.items.map((item) => item.action)).toEqual(["started"]);
  });
});
