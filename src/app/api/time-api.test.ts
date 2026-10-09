import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listProjects } from "@/app/api/projects/route";
import { GET as getTimer } from "@/app/api/timer/route";
import { POST as startRoute } from "@/app/api/timer/start/route";
import { POST as stopRoute } from "@/app/api/timer/stop/route";
import { createProject } from "@/lib/projects";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { WORKSPACE_TIMER_ID } from "@/lib/time-entries";
import { timeCopy } from "@/lib/time-copy";

beforeEach(resetTestDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

function post(url: string, body: unknown, origin?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function stopRequest(origin?: string) {
  return post("http://localhost/api/timer/stop", {}, origin);
}

describe("extension API", () => {
  it("lists only active projects", async () => {
    const active = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const archived = await createProject({
      name: "Old",
      description: null,
      clientId: null,
      billable: false,
    });
    await prisma.project.update({
      where: { id: archived.id },
      data: { archivedAt: new Date() },
    });

    const response = await listProjects();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projects).toEqual([
      { id: active.id, name: "Website", billable: true, client: null },
    ]);
  });

  it("starts one timer, reads it back, and rejects a second start", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });

    const missing = await getTimer();
    expect(await missing.json()).toEqual({ timer: null });

    const started = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id, note: "Call" }),
    );
    expect(started.status).toBe(201);
    const startedBody = await started.json();
    expect(startedBody.timer).toMatchObject({
      projectId: project.id,
      projectName: "Website",
      note: "Call",
      source: "timer",
      billable: true,
    });

    const current = await getTimer();
    const currentBody = await current.json();
    expect(currentBody.timer.id).toBe(startedBody.timer.id);

    const again = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id }),
    );
    expect(again.status).toBe(409);
    const againBody = await again.json();
    expect(againBody.error).toBe(timeCopy.timerAlready);
    expect(againBody.timer.id).toBe(startedBody.timer.id);
    expect(await prisma.runningTimer.count()).toBe(1);
  });

  it("rejects a bad body, an archived project, and stopping when nothing is running", async () => {
    const badType = await startRoute(
      new Request("http://localhost/api/timer/start", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(badType.status).toBe(415);
    expect((await badType.json()).error).toBe(timeCopy.jsonContentType);

    const bad = await startRoute(
      new Request("http://localhost/api/timer/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe(timeCopy.invalidJson);

    const unknown = await startRoute(
      post("http://localhost/api/timer/start", { projectId: "missing-project" }),
    );
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBe(timeCopy.projectMissing);

    const project = await createProject({
      name: "Old",
      description: null,
      clientId: null,
      billable: true,
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date() },
    });
    const archived = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id }),
    );
    expect(archived.status).toBe(400);
    expect((await archived.json()).error).toBe(timeCopy.projectInactive);

    const idle = await stopRoute(stopRequest());
    expect(idle.status).toBe(404);
    expect((await idle.json()).error).toBe(timeCopy.timerNone);
  });

  it("stops a persisted timer and reports a 24-hour cap", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: false,
    });
    const startedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const entry = await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: null,
        startedAt,
        endedAt: null,
        billable: false,
        note: null,
        source: "timer",
      },
    });
    await prisma.runningTimer.create({
      data: { id: WORKSPACE_TIMER_ID, timeEntryId: entry.id },
    });

    const before = await getTimer();
    expect((await before.json()).timer.id).toBe(entry.id);

    const stopped = await stopRoute(stopRequest());
    expect(stopped.status).toBe(200);
    const body = await stopped.json();
    expect(body.entry.capped).toBe(true);
    expect(body.entry.durationMs).toBe(24 * 60 * 60 * 1000);
    expect(body.entry.source).toBe("timer");
    expect(body.warnings).toContain(timeCopy.timerCapped);
    expect((await getTimer()).status).toBe(200);
    expect(await (await getTimer()).json()).toEqual({ timer: null });
  });

  it("rejects another website and accepts the app origin or an allowlisted one", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const foreign = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id }, "https://evil.test"),
    );
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).error).toBe(timeCopy.originForbidden);

    const foreignStop = await stopRoute(
      stopRequest("https://evil.test"),
    );
    expect(foreignStop.status).toBe(403);

    const plainStop = await stopRoute(
      new Request("http://localhost/api/timer/stop", { method: "POST" }),
    );
    expect(plainStop.status).toBe(415);
    expect((await plainStop.json()).error).toBe(timeCopy.jsonContentType);

    const sameOrigin = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id }, "http://localhost"),
    );
    expect(sameOrigin.status).toBe(201);
    await prisma.timeEntry.updateMany({
      where: { endedAt: null },
      data: { startedAt: new Date(Date.now() - 2000) },
    });
    const stopped = await stopRoute(stopRequest("http://localhost"));
    expect(stopped.status).toBe(200);

    process.env.ULIXDESK_TIMER_ORIGINS = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";
    try {
      const extension = await startRoute(
        post(
          "http://localhost/api/timer/start",
          { projectId: project.id },
          "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef",
        ),
      );
      expect(extension.status).toBe(201);
    } finally {
      delete process.env.ULIXDESK_TIMER_ORIGINS;
    }
  });
});
