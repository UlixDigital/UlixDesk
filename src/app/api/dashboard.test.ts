import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/dashboard/route";
import { apiCodes } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { dashboardCopy } from "@/lib/dashboard-copy";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { signInAs } from "@/lib/test-actor";

const MONEY = /\$|\bUSD\b|\bEUR\b|\bGBP\b|\bJPY\b|amountMinor|rateMinor/;

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function call(path: string, cookie?: string) {
  const headers = new Headers({ host: "127.0.0.1:3000" });
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return GET(new Request(`http://127.0.0.1:3000${path}`, { headers }));
}

describe("GET /api/dashboard", () => {
  it("requires a session and refuses team scope for a member", async () => {
    const anonymous = await call("/api/dashboard?scope=all");
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: authCopy.apiAuthRequired,
      code: apiCodes.AUTH_REQUIRED,
    });

    const member = await signInAs("member", "api-member@ulix.test");
    const hidden = await signInAs("member", "api-hidden@ulix.test");
    await prisma.user.update({ where: { id: hidden.user.id }, data: { name: "Hidden Person" } });
    const owner = await signInAs("owner", "api-owner@ulix.test");
    const project = await prisma.project.create({
      data: { name: "Secret Budget Project", billable: true },
    });
    await prisma.billRate.create({
      data: {
        scope: "project",
        projectId: project.id,
        amountMinor: 5_000,
        currency: "USD",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.user.id,
      },
    });
    await prisma.budget.create({
      data: {
        scope: "project",
        projectId: project.id,
        basis: "cost",
        amount: 10_000,
        currency: "USD",
        recurrence: "total",
        billableOnly: true,
        createdById: owner.user.id,
      },
    });
    const started = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: hidden.user.id,
        startedAt: started,
        endedAt: new Date(started.getTime() + 60 * 60 * 1000),
        billable: true,
        source: "manual",
      },
    });

    const forbidden = await call("/api/dashboard?scope=all", member.cookie);
    expect(forbidden.status).toBe(403);
    const forbiddenBody = await forbidden.json();
    expect(forbiddenBody).toEqual({
      error: dashboardCopy.scopeDenied,
      code: apiCodes.SCOPE_FORBIDDEN,
    });
    expect(JSON.stringify(forbiddenBody)).not.toMatch(MONEY);
    expect(JSON.stringify(forbiddenBody)).not.toContain("Hidden Person");

    const own = await call("/api/dashboard?scope=me", member.cookie);
    expect(own.status).toBe(200);
    const ownBody = await own.json();
    expect(ownBody.dashboard.showMoney).toBe(false);
    expect(ownBody.dashboard.scope).toBe("me");
    expect(ownBody.dashboard.budgets).toEqual([]);
    const ownJson = JSON.stringify(ownBody);
    expect(ownJson).not.toMatch(MONEY);
    expect(ownJson).not.toContain("Hidden Person");

    const team = await call("/api/dashboard?scope=all", owner.cookie);
    expect(team.status).toBe(200);
    const teamBody = await team.json();
    expect(teamBody.dashboard.scope).toBe("all");
    expect(JSON.stringify(teamBody)).toContain("Hidden Person");
    expect(JSON.stringify(teamBody)).toContain("$50.00");
  });
});
