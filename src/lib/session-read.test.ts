import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as clearSession } from "@/app/session/clear/route";
import { GET as refreshSession } from "@/app/session/refresh/route";
import { safeResumePath } from "@/lib/access-decision";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { readSession, rotateSessionIfDue } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { testState } from "@/lib/test-hooks";
import { signInAs } from "@/lib/test-actor";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("session reads do not write cookies", () => {
  it("treats an expired, idle, deactivated, or unsigned cookie as signed out", async () => {
    const signedIn = await signInAs("member", "session-read@ulix.test");
    const cookie = signedIn.cookie;
    expect(testState.sessionToken).toBe(cookie);

    await prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await readSession();
    expect(expired).toEqual({ status: "anonymous", hadCookie: true });
    expect(testState.sessionToken).toBe(cookie);
    expect(await prisma.session.count()).toBe(0);

    const idle = await signInAs("member", "idle-session@ulix.test");
    await prisma.session.updateMany({
      where: { userId: idle.user.id },
      data: { lastSeenAt: new Date(Date.now() - 13 * 60 * 60 * 1000) },
    });
    expect(await readSession()).toEqual({ status: "anonymous", hadCookie: true });
    expect(testState.sessionToken).toBe(idle.cookie);
    expect(await prisma.session.count({ where: { userId: idle.user.id } })).toBe(0);

    const deactivated = await signInAs("member", "deactivated-session@ulix.test");
    await prisma.user.update({
      where: { id: deactivated.user.id },
      data: { deactivatedAt: new Date() },
    });
    expect(await readSession()).toEqual({ status: "anonymous", hadCookie: true });
    expect(testState.sessionToken).toBe(deactivated.cookie);
    expect(await prisma.session.count({ where: { userId: deactivated.user.id } })).toBe(0);

    testState.sessionToken = "not-a-signed-cookie";
    expect(await readSession()).toEqual({ status: "anonymous", hadCookie: true });
    expect(testState.sessionToken).toBe("not-a-signed-cookie");
  });

  it("reports a 15-minute-old token without replacing the cookie", async () => {
    const signedIn = await signInAs("member", "rotate-session@ulix.test");
    const before = await prisma.session.findFirstOrThrow({ where: { userId: signedIn.user.id } });
    await prisma.session.update({
      where: { id: before.id },
      data: { rotatedAt: new Date(Date.now() - 20 * 60 * 1000) },
    });

    const read = await readSession();
    expect(read.status).toBe("rotate");
    expect(testState.sessionToken).toBe(signedIn.cookie);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: before.id } })).tokenHash).toBe(
      before.tokenHash,
    );

    const rotated = await rotateSessionIfDue();
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.cookie).toBeTruthy();
    expect(testState.sessionToken).toBe(rotated.cookie);
    expect(testState.sessionToken).not.toBe(signedIn.cookie);
    expect((await readSession()).status).toBe("user");
  });

  it("accepts the previous token when two refreshes race", async () => {
    const signedIn = await signInAs("member", "race-session@ulix.test");
    const before = await prisma.session.findFirstOrThrow({ where: { userId: signedIn.user.id } });
    await prisma.session.update({
      where: { id: before.id },
      data: { rotatedAt: new Date(Date.now() - 20 * 60 * 1000) },
    });

    const [first, second] = await Promise.all([rotateSessionIfDue(), rotateSessionIfDue()]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const issued = [first.cookie, second.cookie].filter((cookie) => cookie !== null);
    expect(issued).toHaveLength(1);

    testState.sessionToken = signedIn.cookie;
    expect((await readSession()).status).toBe("user");
    const response = await refreshSession(
      new Request("http://127.0.0.1:3000/session/refresh?next=%2Fsettings", {
        headers: { cookie: `${SESSION_COOKIE}=${signedIn.cookie}` },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("Max-Age=0");
  });
});

describe("session routes", () => {
  it("clears a dead cookie and resumes only sign-in or the password link", async () => {
    const signedIn = await signInAs("member", "clear-session@ulix.test");
    expect(safeResumePath("/set-password?token=abc&resumed=1")).toBe(
      "/set-password?token=abc&resumed=1",
    );
    expect(safeResumePath("https://evil.test/set-password")).toBe("/login");
    expect(safeResumePath("/clients")).toBe("/login");

    const response = await clearSession(
      new Request("http://127.0.0.1:3000/session/clear?next=%2Fset-password%3Ftoken%3Dabc", {
        headers: { cookie: `${SESSION_COOKIE}=${signedIn.cookie}` },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/set-password?token=abc");
    expect(response.headers.get("set-cookie") ?? "").toContain(`${SESSION_COOKIE}=`);
    expect(await prisma.session.count({ where: { userId: signedIn.user.id } })).toBe(0);
  });

  it("rotates from the refresh route instead of during a page read", async () => {
    const signedIn = await signInAs("member", "refresh-session@ulix.test");
    await prisma.session.updateMany({
      where: { userId: signedIn.user.id },
      data: { rotatedAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    const response = await refreshSession(
      new Request("http://127.0.0.1:3000/session/refresh?next=%2Fsettings", {
        headers: { cookie: `${SESSION_COOKIE}=${signedIn.cookie}` },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings");
    expect(response.headers.get("set-cookie") ?? "").toContain(`${SESSION_COOKIE}=`);
    expect(testState.sessionToken).not.toBe(signedIn.cookie);
  });
});
