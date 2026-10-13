import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { GET as listProjects } from "@/app/api/projects/route";
import { loginAction } from "@/app/login/actions";
import { createAccessTokenAction } from "@/app/settings/actions";
import { saveClientAction } from "@/app/clients/actions";
import { sessionGate } from "@/lib/access-decision";
import { createAccessToken, findUsableAccessToken, revokeAccessToken } from "@/lib/access-tokens";
import { authCopy } from "@/lib/auth-copy";
import { authenticateLogin, loginUser, logoutUser } from "@/lib/auth";
import { originAllowed } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { assignLegacyWorkspaceToOwner, LEGACY_TIMER_ID } from "@/lib/legacy-owner";
import { createProject } from "@/lib/projects";
import { resetLoginRateLimits } from "@/lib/rate-limit";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { getCurrentUser } from "@/lib/session";
import { setTestRequestHeaders } from "@/lib/test-hooks";
import { createTestUser, signInAs } from "@/lib/test-actor";
import { startTimer } from "@/lib/time-entries";
import { createTeamMember, setTeamRole, setUserActive } from "@/lib/users";
import { emptyClientFormValues, type ClientFormState } from "@/lib/validation";

const clientInitial: ClientFormState = { errors: {}, values: emptyClientFormValues };
const tokenInitial = { errors: {}, values: { name: "" }, token: null, tokenName: null };

beforeEach(async () => {
  resetLoginRateLimits();
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("login and logout", () => {
  it("signs in with a password, then signs out", async () => {
    const user = await createTestUser("member", "member@ulix.test");
    const signedIn = await loginUser("Member@Ulix.Test", "test-password-10");
    expect(signedIn.ok).toBe(true);
    expect((await getCurrentUser())?.id).toBe(user.id);

    await logoutUser();
    expect(await getCurrentUser()).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("rejects a wrong password and a deactivated account", async () => {
    const user = await createTestUser("member", "member@ulix.test");
    const wrong = await authenticateLogin("member@ulix.test", "wrong-password", "203.0.113.4");
    expect(wrong).toEqual({ ok: false, error: authCopy.invalidLogin, code: "invalid" });

    await prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date("2026-10-01T00:00:00.000Z") },
    });
    const deactivated = await authenticateLogin(
      "member@ulix.test",
      "test-password-10",
      "203.0.113.5",
    );
    expect(deactivated).toEqual({ ok: false, error: authCopy.deactivated, code: "deactivated" });
  });

  it("limits repeated failures for one address and for one account", async () => {
    const now = Date.parse("2026-10-13T08:00:00.000Z");
    await createTestUser("member", "member@ulix.test");
    await createTestUser("admin", "admin@ulix.test");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await authenticateLogin(
        "missing@ulix.test",
        "wrong-password",
        "203.0.113.10",
        now,
      );
      expect(result.code).toBe("invalid");
    }
    const byIp = await authenticateLogin("admin@ulix.test", "test-password-10", "203.0.113.10", now);
    expect(byIp).toEqual({ ok: false, error: authCopy.rateLimited, code: "rate-limited" });

    const otherAddress = await authenticateLogin(
      "admin@ulix.test",
      "test-password-10",
      "203.0.113.11",
      now,
    );
    expect(otherAddress.ok).toBe(true);

    resetLoginRateLimits();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await authenticateLogin(
        "member@ulix.test",
        "wrong-password",
        `203.0.113.${attempt + 20}`,
        now,
      );
      expect(result.code).toBe("invalid");
    }
    const byAccount = await authenticateLogin(
      "member@ulix.test",
      "test-password-10",
      "198.51.100.8",
      now,
    );
    expect(byAccount).toEqual({ ok: false, error: authCopy.rateLimited, code: "rate-limited" });
  });
});

describe("protected routes and roles", () => {
  it("sends pages without a session to sign-in and leaves token routes to the handler", () => {
    expect(sessionGate({ pathname: "/clients", hasValidSession: false, isTokenApi: false })).toEqual({
      type: "redirect",
      to: "/login",
    });
    expect(sessionGate({ pathname: "/settings", hasValidSession: false, isTokenApi: false })).toEqual({
      type: "redirect",
      to: "/login?next=%2Fsettings",
    });
    expect(sessionGate({ pathname: "/login", hasValidSession: false, isTokenApi: false })).toEqual({
      type: "allow",
    });
    expect(sessionGate({ pathname: "/api/timer/start", hasValidSession: false, isTokenApi: true })).toEqual({
      type: "allow",
    });
    expect(sessionGate({ pathname: "/clients", hasValidSession: true, isTokenApi: false })).toEqual({
      type: "allow",
    });
  });

  it("refuses an API call that has neither a session nor a bearer token", async () => {
    const response = await listProjects(new Request("http://localhost/api/projects"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: authCopy.apiAuthRequired,
      code: "AUTH_REQUIRED",
    });
  });

  it("lets owners and admins manage the workspace, and keeps members to their own time", async () => {
    const owner = await createTestUser("owner", "owner@ulix.test");
    const admin = await createTestUser("admin", "admin@ulix.test");
    const member = await signInAs("member", "member@ulix.test");

    const denied = await saveClientAction(clientInitial, form({ name: "Acme" }));
    expect(denied.errors.form).toBe(authCopy.manageDenied);
    expect(await prisma.client.count()).toBe(0);

    const added = await createTeamMember({
      actor: admin,
      name: "New Member",
      email: "new@ulix.test",
      role: "member",
    });
    expect(added.ok).toBe(true);

    const adminTouchesOwner = await setUserActive({
      actor: admin,
      userId: owner.id,
      active: false,
    });
    expect(adminTouchesOwner).toEqual({ ok: false, error: authCopy.cannotManageOwner });

    const demoteLastOwner = await setTeamRole({
      actor: owner,
      userId: owner.id,
      role: "admin",
    });
    expect(demoteLastOwner).toEqual({ ok: false, error: authCopy.lastOwner });

    const self = await setUserActive({
      actor: member.user,
      userId: member.user.id,
      active: false,
    });
    expect(self).toEqual({ ok: false, error: authCopy.cannotDeactivateSelf });
  });
});

describe("request protection", () => {
  it("rejects a server action whose Origin does not match the host", async () => {
    await signInAs("member", "csrf@ulix.test");
    setTestRequestHeaders({
      origin: "https://evil.test",
      host: "127.0.0.1:3000",
    });
    expect(await originAllowed()).toBe(false);

    const login = await loginAction(
      { error: null, email: "" },
      form({ email: "csrf@ulix.test", password: "test-password-10" }),
    );
    expect(login.error).toBe(authCopy.csrfRejected);

    const token = await createAccessTokenAction(tokenInitial, form({ name: "Laptop" }));
    expect(token.errors.form).toBe(authCopy.csrfRejected);
    expect(await prisma.accessToken.count()).toBe(0);

    setTestRequestHeaders({
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
    });
    expect(await originAllowed()).toBe(true);
  });
});

describe("user-tied tokens and timers", () => {
  it("keeps an extension token on the person who created it", async () => {
    const owner = await createTestUser("member", "one@ulix.test");
    const other = await createTestUser("member", "two@ulix.test");
    const created = await createAccessToken("Laptop", owner.id);
    expect((await findUsableAccessToken(created.token))?.userId).toBe(owner.id);
    expect(await revokeAccessToken(created.record.id, other.id)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(await findUsableAccessToken(created.token)).not.toBeNull();

    await prisma.user.update({
      where: { id: owner.id },
      data: { deactivatedAt: new Date() },
    });
    expect(await findUsableAccessToken(created.token)).toBeNull();
  });

  it("lets two people run a timer at the same time", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const first = await createTestUser("member", "first@ulix.test");
    const second = await createTestUser("member", "second@ulix.test");
    const now = new Date("2026-10-13T09:00:00.000Z");
    const startedFirst = await startTimer({ userId: first.id, projectId: project.id, note: "", now });
    const startedSecond = await startTimer({
      userId: second.id,
      projectId: project.id,
      note: "",
      now,
    });
    expect(startedFirst.ok).toBe(true);
    expect(startedSecond.ok).toBe(true);
    expect(await prisma.runningTimer.count()).toBe(2);
    const again = await startTimer({ userId: first.id, projectId: project.id, note: "", now });
    expect(again.ok).toBe(false);
  });
});

describe("legacy time assignment", () => {
  it("gives unowned entries and the workspace timer to the owner", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const owner = await createTestUser("owner", "legacy-owner@ulix.test");
    const finished = await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: null,
        startedAt: new Date("2026-10-01T09:00:00.000Z"),
        endedAt: new Date("2026-10-01T10:00:00.000Z"),
        billable: true,
        source: "manual",
      },
    });
    const running = await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: null,
        startedAt: new Date("2026-10-13T09:00:00.000Z"),
        endedAt: null,
        billable: true,
        source: "timer",
      },
    });
    await prisma.runningTimer.create({
      data: { id: LEGACY_TIMER_ID, timeEntryId: running.id },
    });

    for (const statement of migrationStatements()) {
      await prisma.$executeRawUnsafe(statement);
    }

    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: finished.id } })).userId).toBe(
      owner.id,
    );
    expect(await prisma.runningTimer.findUnique({ where: { id: LEGACY_TIMER_ID } })).toBeNull();
    expect((await prisma.runningTimer.findUniqueOrThrow({ where: { id: owner.id } })).timeEntryId).toBe(
      running.id,
    );

    await assignLegacyWorkspaceToOwner(owner.id);
    expect(await prisma.runningTimer.count()).toBe(1);
  });

  it("closes the legacy timer when the owner is already tracking", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const owner = await createTestUser("owner", "busy-owner@ulix.test");
    const ownEntry = await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: owner.id,
        startedAt: new Date("2026-10-13T08:00:00.000Z"),
        endedAt: null,
        billable: true,
        source: "timer",
      },
    });
    await prisma.runningTimer.create({ data: { id: owner.id, timeEntryId: ownEntry.id } });
    const legacyEntry = await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: null,
        startedAt: new Date("2026-10-13T07:00:00.000Z"),
        endedAt: null,
        billable: true,
        source: "timer",
      },
    });
    await prisma.runningTimer.create({
      data: { id: LEGACY_TIMER_ID, timeEntryId: legacyEntry.id },
    });

    await assignLegacyWorkspaceToOwner(owner.id);

    expect(await prisma.runningTimer.findUnique({ where: { id: LEGACY_TIMER_ID } })).toBeNull();
    expect((await prisma.runningTimer.findUniqueOrThrow({ where: { id: owner.id } })).timeEntryId).toBe(
      ownEntry.id,
    );
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: legacyEntry.id } })).endedAt).not.toBeNull();
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: legacyEntry.id } })).userId).toBe(
      owner.id,
    );
  });
});

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

function migrationStatements() {
  const source = readFileSync(
    "prisma/migrations/20261013121000_assign_legacy_owner/migration.sql",
    "utf8",
  );
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
