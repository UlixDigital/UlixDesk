import { describe, expect, it } from "vitest";
import { timeCopy } from "@/lib/time-copy";
import { tokenCopy } from "@/lib/token-copy";
import { popupCopy } from "./copy";
import { fetchProjects, fetchTimer, requestExtensionSignIn, startTimer, stopTimer, type FetchLike } from "./api";

const config = { serverUrl: "http://127.0.0.1:3000/", token: "ulixdesk_secret" };
const timer = {
  id: "timer-1",
  projectId: "website",
  projectName: "Website",
  clientName: "Acme",
  startedAt: "2026-10-10T05:00:00.000Z",
  billable: true,
  note: null,
  source: "timer",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("extension API client", () => {
  it("sends the bearer token only to the server origin", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      expect(url).not.toContain(config.token);
      expect(JSON.stringify(init?.body ?? "")).not.toContain("Bearer");
      return jsonResponse({ projects: [] });
    };
    const result = await fetchProjects(config, fetchImpl);
    expect(result).toEqual({ ok: true, projects: [] });
    expect(calls[0]?.url).toBe("http://127.0.0.1:3000/api/projects");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${config.token}`);
    expect(calls[0]?.init?.credentials).toBe("omit");
  });

  it("maps connection failures without calling the network when it cannot", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("offline");
    };
    expect(await fetchProjects({ serverUrl: "", token: "" }, fetchImpl)).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(await fetchProjects({ serverUrl: "notaurl", token: "token" }, fetchImpl)).toEqual({
      ok: false,
      reason: "invalid-url",
    });
    expect(await fetchTimer(config, fetchImpl)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("treats 401 as an invalid token and an archived project as its own result", async () => {
    const unauthorized: FetchLike = async () =>
      jsonResponse({ error: tokenCopy.tokenRejected }, 401);
    expect(await fetchTimer(config, unauthorized)).toMatchObject({
      ok: false,
      reason: "unauthorized",
    });

    const archived: FetchLike = async () =>
      jsonResponse({ error: timeCopy.projectInactive, code: "PROJECT_ARCHIVED" }, 400);
    expect(await startTimer(config, "old", "", archived)).toEqual({
      ok: false,
      reason: "archived",
      message: timeCopy.projectInactive,
    });

    const missing: FetchLike = async () =>
      jsonResponse({ error: "That project no longer exists.", code: "PROJECT_NOT_FOUND" }, 404);
    expect(await startTimer(config, "gone", "", missing)).toEqual({
      ok: false,
      reason: "missing",
      message: popupCopy.projectMissing,
    });

    const archivedWithoutCode: FetchLike = async () =>
      jsonResponse({ error: timeCopy.projectInactive }, 400);
    expect(await startTimer(config, "old", "", archivedWithoutCode)).toMatchObject({
      ok: false,
      reason: "http",
    });

    const running: FetchLike = async () =>
      jsonResponse({ error: timeCopy.timerAlready, code: "ALREADY_RUNNING", timer }, 409);
    expect(await startTimer(config, "website", "Note", running)).toEqual({
      ok: false,
      reason: "already-running",
      timer,
      message: timeCopy.timerAlready,
    });
  });

  it("reads a timer and a stopped entry", async () => {
    const current: FetchLike = async () => jsonResponse({ timer });
    expect(await fetchTimer(config, current)).toEqual({ ok: true, timer });

    const idle: FetchLike = async () => jsonResponse({ timer: null });
    expect(await fetchTimer(config, idle)).toEqual({ ok: true, timer: null });

    const stopped: FetchLike = async () =>
      jsonResponse({ entry: { id: "timer-1" }, warnings: [timeCopy.overlap] });
    expect(await stopTimer(config, stopped)).toEqual({ ok: true, warnings: [timeCopy.overlap] });

    const tooShort: FetchLike = async () =>
      jsonResponse({ error: timeCopy.timerShort, code: "TOO_SHORT" }, 409);
    expect(await stopTimer(config, tooShort)).toEqual({
      ok: false,
      reason: "too-short",
      message: timeCopy.timerShort,
    });

    const notRunning: FetchLike = async () =>
      jsonResponse({ error: timeCopy.timerNone, code: "NOT_RUNNING" }, 404);
    expect(await stopTimer(config, notRunning)).toEqual({
      ok: false,
      reason: "not-running",
      message: timeCopy.timerNone,
    });

    const statusOnly: FetchLike = async () => jsonResponse({ error: timeCopy.timerShort }, 409);
    expect(await stopTimer(config, statusOnly)).toMatchObject({ ok: false, reason: "http" });
  });

  it("posts the password once and does not put it on the URL or in the saved session", async () => {
    const password = "local-owner-password";
    let sentUrl = "";
    let sentBody = "";
    const fetchImpl: FetchLike = async (url, init) => {
      sentUrl = url;
      sentBody = String(init?.body ?? "");
      return jsonResponse(
        {
          accessToken: "ulixdesk_a_access",
          refreshToken: "ulixdesk_r_refresh",
          accessExpiresAt: "2026-10-14T05:15:00.000Z",
          refreshExpiresAt: "2026-11-13T05:00:00.000Z",
          user: { name: "Local Owner", email: "owner@ulix.local" },
        },
        201,
      );
    };
    const result = await requestExtensionSignIn(
      { serverUrl: "http://127.0.0.1:3000", email: "owner@ulix.local", password },
      fetchImpl,
    );
    expect(sentUrl).toBe("http://127.0.0.1:3000/api/extension/session");
    expect(sentUrl).not.toContain(password);
    expect(sentBody).toContain(password);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(password);
  });
});
