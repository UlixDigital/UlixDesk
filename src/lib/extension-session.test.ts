import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccessToken, findUsableAccessToken } from "@/lib/access-tokens";
import { authCopy } from "@/lib/auth-copy";
import { prisma } from "@/lib/db";
import {
  ACCESS_TTL_MS,
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TTL_MS,
  createExtensionSession,
  findUsableExtensionAccess,
  revokeExtensionSession,
  rotateExtensionSession,
} from "@/lib/extension-session";
import { resetLoginRateLimits } from "@/lib/rate-limit";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createSession } from "@/lib/session";
import { setTestSessionToken } from "@/lib/test-hooks";
import { createTestUser, signInAs } from "@/lib/test-actor";
import { changeOwnPassword, consumeSetupToken, resetTeamPassword, setUserActive } from "@/lib/users";

let userId = "";

beforeEach(async () => {
  resetLoginRateLimits();
  await resetTestDatabase();
  userId = (await createTestUser("member", "extension-session@ulix.test")).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("extension sessions", () => {
  it("stores only hashes and accepts the access token until it expires", async () => {
    const now = new Date("2026-10-14T05:00:00.000Z");
    const created = await createExtensionSession({ userId, label: "Chrome on Linux", now });
    expect(created.accessToken).toMatch(/^ulixdesk_a_[A-Za-z0-9_-]{43}$/);
    expect(created.refreshToken).toMatch(/^ulixdesk_r_[A-Za-z0-9_-]{43}$/);
    expect(created.accessExpiresAt.toISOString()).toBe(new Date(now.getTime() + ACCESS_TTL_MS).toISOString());
    expect(created.refreshExpiresAt.toISOString()).toBe(new Date(now.getTime() + REFRESH_TTL_MS).toISOString());

    const row = await prisma.extensionSession.findUniqueOrThrow({ where: { id: created.record.id } });
    expect(JSON.stringify(row)).not.toContain(created.accessToken);
    expect(JSON.stringify(row)).not.toContain(created.refreshToken);
    expect(row.label).toBe("Chrome on Linux");

    expect((await findUsableExtensionAccess(created.accessToken, now))?.userId).toBe(userId);
    expect(await findUsableAccessToken(created.accessToken)).toBeNull();
    expect(await findUsableExtensionAccess(created.refreshToken, now)).toBeNull();
    expect(
      await findUsableExtensionAccess(created.accessToken, new Date(now.getTime() + ACCESS_TTL_MS)),
    ).toBeNull();
  });

  it("rotates the refresh token and revokes the sign-in when an old one is reused", async () => {
    const now = new Date("2026-10-14T05:00:00.000Z");
    const created = await createExtensionSession({ userId, label: "Chrome on macOS", now });
    const rotated = await rotateExtensionSession(created.refreshToken, now);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    expect(await findUsableExtensionAccess(created.accessToken, now)).toBeNull();
    expect((await findUsableExtensionAccess(rotated.accessToken, now))?.userId).toBe(userId);

    const raced = await rotateExtensionSession(created.refreshToken, new Date(now.getTime() + 1000));
    expect(raced).toEqual({ ok: false, code: "invalid" });
    expect(await findUsableExtensionAccess(rotated.accessToken, now)).not.toBeNull();

    const again = await rotateExtensionSession(rotated.refreshToken, new Date(now.getTime() + 1000));
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    const reused = await rotateExtensionSession(
      rotated.refreshToken,
      new Date(now.getTime() + 1000 + REFRESH_REUSE_GRACE_MS + 1),
    );
    expect(reused).toEqual({ ok: false, code: "reused" });
    expect(await findUsableExtensionAccess(again.accessToken, now)).toBeNull();
    expect(await rotateExtensionSession(again.refreshToken, now)).toEqual({ ok: false, code: "invalid" });
  });

  it("revokes extension sign-ins when the password changes, and signs out other web sessions", async () => {
    const signedIn = await signInAs("member", "password-sessions@ulix.test");
    const currentCookie = signedIn.cookie;
    await createSession(signedIn.user.id);
    setTestSessionToken(currentCookie);
    const extension = await createExtensionSession({
      userId: signedIn.user.id,
      label: "Chrome on Linux",
    });
    const manual = await createAccessToken("Work laptop", signedIn.user.id);
    const { currentSessionTokenHash } = await import("@/lib/session");
    const keep = await currentSessionTokenHash();
    await prisma.session.update({
      where: { tokenHash: keep ?? "" },
      data: {
        previousTokenHash: "c".repeat(64),
        previousTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const saved = await changeOwnPassword({
      userId: signedIn.user.id,
      currentPassword: "test-password-10",
      nextPassword: "new-password-10",
      keepSessionTokenHash: keep,
    });
    expect(saved).toEqual({ ok: true });

    const sessions = await prisma.session.findMany({ where: { userId: signedIn.user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(keep);
    expect(sessions[0]?.previousTokenHash).toBeNull();
    expect(sessions[0]?.previousTokenExpiresAt).toBeNull();
    expect(await findUsableExtensionAccess(extension.accessToken)).toBeNull();
    expect(await findUsableAccessToken(manual.token)).toBeNull();
    expect(
      (await prisma.extensionSession.findUniqueOrThrow({ where: { id: extension.record.id } })).revokedAt,
    ).not.toBeNull();
    expect(
      (await prisma.accessToken.findUniqueOrThrow({ where: { id: manual.record.id } })).revokedAt,
    ).not.toBeNull();
  });

  it("keeps this browser signed in when the password change presents the grace token", async () => {
    const signedIn = await signInAs("member", "grace-password@ulix.test");
    setTestSessionToken(signedIn.cookie);
    const { currentSessionTokenHash } = await import("@/lib/session");
    const current = await currentSessionTokenHash();
    expect(current).toBeTruthy();
    const grace = "a".repeat(64);
    await prisma.session.update({
      where: { tokenHash: current ?? "" },
      data: {
        previousTokenHash: grace,
        previousTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await createSession(signedIn.user.id);

    const saved = await changeOwnPassword({
      userId: signedIn.user.id,
      currentPassword: "test-password-10",
      nextPassword: "new-password-10",
      keepSessionTokenHash: grace,
    });
    expect(saved).toEqual({ ok: true });

    const sessions = await prisma.session.findMany({ where: { userId: signedIn.user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(grace);
    expect(sessions[0]?.previousTokenHash).toBeNull();
    expect(sessions[0]?.previousTokenExpiresAt).toBeNull();
  });

  it("revokes extension sign-ins and manual access tokens when a set-password link is used", async () => {
    const owner = await createTestUser("owner", "setup-owner@ulix.test");
    const member = await createTestUser("member", "setup-member@ulix.test");
    const extension = await createExtensionSession({ userId: member.id, label: "Chrome on Linux" });
    const manual = await createAccessToken("Work laptop", member.id);
    const reset = await resetTeamPassword({
      actor: { id: owner.id, role: "owner" },
      userId: member.id,
    });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    const saved = await consumeSetupToken(reset.token, "new-password-10");
    expect(saved).toEqual({ ok: true });
    expect(await findUsableExtensionAccess(extension.accessToken)).toBeNull();
    expect(await findUsableAccessToken(manual.token)).toBeNull();
  });

  it("rate-limits wrong current-password attempts", async () => {
    const now = Date.parse("2026-10-14T05:00:00.000Z");
    const user = await createTestUser("member", "password-limit@ulix.test");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const wrong = await changeOwnPassword({
        userId: user.id,
        currentPassword: "wrong-password",
        nextPassword: "new-password-10",
        keepSessionTokenHash: null,
        now,
      });
      expect(wrong).toEqual({ ok: false, error: authCopy.currentPasswordWrong });
    }
    const limited = await changeOwnPassword({
      userId: user.id,
      currentPassword: "test-password-10",
      nextPassword: "new-password-10",
      keepSessionTokenHash: null,
      now,
    });
    expect(limited).toEqual({ ok: false, error: authCopy.passwordRateLimited });
  });

  it("revokes a listed sign-in and revokes every sign-in when the account is deactivated", async () => {
    const created = await createExtensionSession({ userId, label: "Chrome on Linux" });
    expect(await revokeExtensionSession(created.record.id, userId)).toEqual({ ok: true, already: false });
    expect(await revokeExtensionSession(created.record.id, userId)).toEqual({ ok: true, already: true });
    expect(await findUsableExtensionAccess(created.accessToken)).toBeNull();

    const owner = await createTestUser("owner", "extension-owner@ulix.test");
    const live = await createExtensionSession({ userId, label: "Chrome on Windows" });
    const deactivated = await setUserActive({
      actor: { id: owner.id, role: "owner" },
      userId,
      active: false,
    });
    expect(deactivated).toEqual({ ok: true });
    expect(await findUsableExtensionAccess(live.accessToken)).toBeNull();
  });
});
