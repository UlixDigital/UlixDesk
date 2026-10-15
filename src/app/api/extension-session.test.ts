import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signIn, GET as currentSession } from "@/app/api/extension/session/route";
import { POST as refreshSession } from "@/app/api/extension/session/refresh/route";
import { POST as revokeSession } from "@/app/api/extension/session/revoke/route";
import { GET as listProjects } from "@/app/api/projects/route";
import { apiCodes } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { prisma } from "@/lib/db";
import { extensionSessionCopy } from "@/lib/extension-session-copy";
import { REFRESH_REUSE_GRACE_MS } from "@/lib/extension-session";
import { resetLoginRateLimits } from "@/lib/rate-limit";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";
import { timeCopy } from "@/lib/time-copy";
import { tokenCopy } from "@/lib/token-copy";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const extensionOrigin = `chrome-extension://${EXTENSION_ID}`;
const chromeOnLinux =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

beforeEach(async () => {
  resetLoginRateLimits();
  await resetTestDatabase();
  await createTestUser("member", "popup@ulix.test");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("extension sign-in API", () => {
  it("signs in from an allowlisted extension and rejects other origins", async () => {
    const denied = await signIn(
      post("/api/extension/session", { email: "popup@ulix.test", password: "test-password-10" }, "https://evil.test"),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(await denied.json()).toEqual({
      error: timeCopy.originDenied,
      code: apiCodes.ORIGIN_FORBIDDEN,
    });
    expect(await prisma.extensionSession.count()).toBe(0);

    const created = await signIn(
      post("/api/extension/session", { email: "Popup@Ulix.Test", password: "test-password-10" }),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    const body = await created.json();
    expect(body.user).toEqual({ name: "Member", email: "popup@ulix.test" });
    expect(body.accessToken).toMatch(/^ulixdesk_a_/);
    expect(body.refreshToken).toMatch(/^ulixdesk_r_/);
    expect(JSON.stringify(body)).not.toContain("test-password-10");

    const row = await prisma.extensionSession.findFirstOrThrow();
    expect(row.label).toBe("Chrome on Linux");
    expect(JSON.stringify(row)).not.toContain(body.accessToken);
    expect(JSON.stringify(row)).not.toContain(body.refreshToken);

    const projects = await listProjects(
      new Request("http://127.0.0.1:3000/api/projects", {
        headers: { authorization: `Bearer ${body.accessToken}`, origin: extensionOrigin },
      }),
    );
    expect(projects.status).toBe(200);
    expect((await projects.json()).projects).toEqual([]);

    const who = await currentSession(
      new Request("http://127.0.0.1:3000/api/extension/session", {
        headers: { authorization: `Bearer ${body.accessToken}`, origin: extensionOrigin },
      }),
    );
    expect(await who.json()).toEqual({ user: { name: "Member", email: "popup@ulix.test" } });
  });

  it("returns the same sign-in errors as the web form", async () => {
    const missingEmail = await signIn(post("/api/extension/session", { email: "  ", password: "secret" }));
    expect(missingEmail.status).toBe(400);
    expect(await missingEmail.json()).toEqual({
      error: authCopy.emailRequired,
      code: apiCodes.EMAIL_REQUIRED,
    });

    const badEmail = await signIn(post("/api/extension/session", { email: "not-an-email", password: "secret" }));
    expect(await badEmail.json()).toEqual({
      error: authCopy.emailInvalid,
      code: apiCodes.EMAIL_INVALID,
    });

    const missingPassword = await signIn(post("/api/extension/session", { email: "popup@ulix.test", password: "" }));
    expect(await missingPassword.json()).toEqual({
      error: authCopy.passwordRequired,
      code: apiCodes.PASSWORD_REQUIRED,
    });

    const wrong = await signIn(post("/api/extension/session", { email: "popup@ulix.test", password: "wrong-password" }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({
      error: authCopy.invalidLogin,
      code: apiCodes.INVALID_LOGIN,
    });

    await prisma.user.update({
      where: { email: "popup@ulix.test" },
      data: { deactivatedAt: new Date("2026-10-01T00:00:00.000Z") },
    });
    const deactivated = await signIn(
      post("/api/extension/session", { email: "popup@ulix.test", password: "test-password-10" }),
    );
    expect(deactivated.status).toBe(403);
    expect(await deactivated.json()).toEqual({
      error: authCopy.deactivated,
      code: apiCodes.ACCOUNT_DEACTIVATED,
    });
  });

  it("rate-limits repeated failures the same way as web sign-in", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const failed = await signIn(
        post("/api/extension/session", { email: "popup@ulix.test", password: "wrong-password" }),
      );
      expect(failed.status).toBe(401);
    }
    const limited = await signIn(
      post("/api/extension/session", { email: "popup@ulix.test", password: "test-password-10" }),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: authCopy.rateLimited,
      code: apiCodes.RATE_LIMITED,
    });
  });

  it("rotates a refresh token, revokes it on sign-out, and rejects the old access token", async () => {
    const created = await signIn(
      post("/api/extension/session", { email: "popup@ulix.test", password: "test-password-10" }),
    );
    const first = await created.json();
    const rotated = await refreshSession(
      post("/api/extension/session/refresh", { refreshToken: first.refreshToken }),
    );
    expect(rotated.status).toBe(200);
    const second = await rotated.json();
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.user.email).toBe("popup@ulix.test");

    const raced = await refreshSession(
      post("/api/extension/session/refresh", { refreshToken: first.refreshToken }),
    );
    expect(raced.status).toBe(401);
    expect(await raced.json()).toEqual({
      error: extensionSessionCopy.refreshInvalid,
      code: apiCodes.REFRESH_INVALID,
    });

    await prisma.extensionSession.updateMany({
      data: { rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) },
    });
    const reused = await refreshSession(
      post("/api/extension/session/refresh", { refreshToken: first.refreshToken }),
    );
    expect(reused.status).toBe(401);
    expect(await reused.json()).toEqual({
      error: extensionSessionCopy.refreshReused,
      code: apiCodes.REFRESH_REUSED,
    });

    const afterReuse = await listProjects(
      new Request("http://127.0.0.1:3000/api/projects", {
        headers: { authorization: `Bearer ${second.accessToken}` },
      }),
    );
    expect(afterReuse.status).toBe(401);
    expect(await afterReuse.json()).toEqual({
      error: tokenCopy.tokenRejected,
      code: apiCodes.TOKEN_INVALID,
    });

    const fresh = await signIn(
      post("/api/extension/session", { email: "popup@ulix.test", password: "test-password-10" }),
    );
    const live = await fresh.json();
    const revoked = await revokeSession(
      post("/api/extension/session/revoke", { refreshToken: live.refreshToken }),
    );
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ ok: true });
    const rejected = await listProjects(
      new Request("http://127.0.0.1:3000/api/projects", {
        headers: { authorization: `Bearer ${live.accessToken}` },
      }),
    );
    expect(rejected.status).toBe(401);
  });
});

function post(path: string, body: unknown, origin = extensionOrigin) {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "user-agent": chromeOnLinux,
    },
    body: JSON.stringify(body),
  });
}
