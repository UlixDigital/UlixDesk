import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { OPTIONS as projectsOptions, GET as listProjects } from "@/app/api/projects/route";
import { OPTIONS as timerOptions, GET as getTimer } from "@/app/api/timer/route";
import { OPTIONS as startOptions, POST as startRoute } from "@/app/api/timer/start/route";
import { OPTIONS as stopOptions, POST as stopRoute } from "@/app/api/timer/stop/route";
import { createAccessToken, hashAccessToken, revokeAccessToken } from "@/lib/access-tokens";
import { apiCodes } from "@/lib/api-errors";
import { createProject } from "@/lib/projects";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { WORKSPACE_TIMER_ID } from "@/lib/time-entries";
import { timeCopy } from "@/lib/time-copy";
import { tokenCopy } from "@/lib/token-copy";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const extensionOrigin = `chrome-extension://${EXTENSION_ID}`;
const previousExtensionIds = process.env.ULIXDESK_EXTENSION_IDS;

beforeEach(() => {
  process.env.ULIXDESK_EXTENSION_IDS = EXTENSION_ID;
  return resetTestDatabase();
});

afterAll(async () => {
  if (previousExtensionIds === undefined) delete process.env.ULIXDESK_EXTENSION_IDS;
  else process.env.ULIXDESK_EXTENSION_IDS = previousExtensionIds;
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

    const response = await listProjects(new Request("http://localhost/api/projects"));
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

    const missing = await getTimer(new Request("http://localhost/api/timer"));
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

    const current = await getTimer(new Request("http://localhost/api/timer"));
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

    const before = await getTimer(new Request("http://localhost/api/timer"));
    expect((await before.json()).timer.id).toBe(entry.id);

    const stopped = await stopRoute(stopRequest());
    expect(stopped.status).toBe(200);
    const body = await stopped.json();
    expect(body.entry.capped).toBe(true);
    expect(body.entry.durationMs).toBe(24 * 60 * 60 * 1000);
    expect(body.entry.source).toBe("timer");
    expect(body.warnings).toContain(timeCopy.timerCapped);
    expect((await getTimer(new Request("http://localhost/api/timer"))).status).toBe(200);
    expect(await (await getTimer(new Request("http://localhost/api/timer"))).json()).toEqual({ timer: null });
  });

  it("treats localhost, 127.0.0.1, and ::1 on the same port as this app", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const viaLoopback = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id }, "http://127.0.0.1"),
    );
    expect(viaLoopback.status).toBe(201);
    await prisma.timeEntry.updateMany({
      where: { endedAt: null },
      data: { startedAt: new Date(Date.now() - 2000) },
    });
    const stopped = await stopRoute(stopRequest("http://[::1]"));
    expect(stopped.status).toBe(200);

    const wrongPort = await startRoute(
      post("http://localhost/api/timer/start", { projectId: project.id }, "http://127.0.0.1:3000"),
    );
    expect(wrongPort.status).toBe(403);
    expect((await wrongPort.json()).error).toBe(timeCopy.originForbidden);
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

  it("lets a valid bearer token skip the origin check and rejects bad tokens", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const created = await createAccessToken("Work laptop");
    const stored = await prisma.accessToken.findUniqueOrThrow({ where: { id: created.record.id } });
    expect(stored.tokenHash).toBe(hashAccessToken(created.token));
    expect(stored.tokenHash).not.toBe(created.token);
    expect(JSON.stringify(stored)).not.toContain(created.token);
    expect(stored.lastUsedAt).toBeNull();

    const wrongType = await startRoute(
      new Request("http://localhost/api/timer/start", {
        method: "POST",
        headers: { authorization: `Bearer ${created.token}` },
        body: "not-json",
      }),
    );
    expect(wrongType.status).toBe(415);
    expect(
      (await prisma.accessToken.findUniqueOrThrow({ where: { id: created.record.id } })).lastUsedAt,
    ).toBeNull();

    const blocked = await startRoute(
      post(
        "http://localhost/api/timer/start",
        { projectId: project.id },
        extensionOrigin,
      ),
    );
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("access-control-allow-origin")).toBe(extensionOrigin);

    const started = await startRoute(
      bearerPost(
        "http://localhost/api/timer/start",
        { projectId: project.id, note: "From Chrome" },
        created.token,
        extensionOrigin,
      ),
    );
    expect(started.status).toBe(201);
    expect(started.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    expect((await started.json()).timer.note).toBe("From Chrome");
    expect(
      (await prisma.accessToken.findUniqueOrThrow({ where: { id: created.record.id } })).lastUsedAt,
    ).not.toBeNull();

    const projects = await listProjects(
      new Request("http://localhost/api/projects", {
        headers: {
          authorization: `Bearer ${created.token}`,
          origin: extensionOrigin,
        },
      }),
    );
    expect(projects.status).toBe(200);
    expect(projects.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    expect((await projects.json()).projects).toEqual([
      { id: project.id, name: "Website", billable: true, client: null },
    ]);

    const malformed = await getTimer(
      new Request("http://localhost/api/timer", {
        headers: { authorization: "Bearer", origin: "http://localhost" },
      }),
    );
    expect(malformed.status).toBe(401);
    expect(await malformed.json()).toEqual({
      error: tokenCopy.bearerRequired,
      code: apiCodes.BEARER_REQUIRED,
    });

    const basic = await getTimer(
      new Request("http://localhost/api/timer", {
        headers: { authorization: "Basic abc", origin: "http://localhost" },
      }),
    );
    expect(basic.status).toBe(401);
    expect(await basic.json()).toEqual({
      error: tokenCopy.bearerRequired,
      code: apiCodes.BEARER_REQUIRED,
    });

    const unknown = await startRoute(
      bearerPost(
        "http://localhost/api/timer/start",
        { projectId: project.id },
        `${"ulixdesk_"}${"a".repeat(43)}`,
        "http://localhost",
      ),
    );
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({
      error: tokenCopy.tokenRejected,
      code: apiCodes.TOKEN_INVALID,
    });
    expect(await prisma.runningTimer.count()).toBe(1);

    await revokeAccessToken(created.record.id);
    const revoked = await getTimer(
      new Request("http://localhost/api/timer", {
        headers: {
          authorization: `Bearer ${created.token}`,
          origin: extensionOrigin,
        },
      }),
    );
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toEqual({
      error: tokenCopy.tokenRejected,
      code: apiCodes.TOKEN_INVALID,
    });
    expect(revoked.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
  });

  it("answers extension preflight and withholds CORS from other websites", async () => {
    const preflight = await projectsOptions(
      new Request("http://localhost/api/projects", {
        method: "OPTIONS",
        headers: {
          origin: extensionOrigin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization, content-type",
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(preflight.headers.get("vary")).toBe("Origin");

    for (const options of [timerOptions, startOptions, stopOptions]) {
      const response = await options(
        new Request("http://localhost/api/timer/start", {
          method: "OPTIONS",
          headers: { origin: extensionOrigin },
        }),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    }

    const denied = await projectsOptions(
      new Request("http://localhost/api/projects", {
        method: "OPTIONS",
        headers: { origin: "https://evil.test" },
      }),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(await denied.json()).toEqual({
      error: timeCopy.originForbidden,
      code: apiCodes.ORIGIN_FORBIDDEN,
    });

    const otherExtension = await projectsOptions(
      new Request("http://localhost/api/projects", {
        method: "OPTIONS",
        headers: { origin: "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      }),
    );
    expect(otherExtension.status).toBe(403);
    expect(otherExtension.headers.get("access-control-allow-origin")).toBeNull();

    const read = await listProjects(
      new Request("http://localhost/api/projects", {
        headers: { origin: "https://evil.test" },
      }),
    );
    expect(read.status).toBe(403);
    expect(read.headers.get("access-control-allow-origin")).toBeNull();
  });
});

function bearerPost(url: string, body: unknown, token: string, origin?: string) {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  });
  if (origin) headers.set("origin", origin);
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
