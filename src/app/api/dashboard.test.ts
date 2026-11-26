import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/dashboard/route";
import { apiCodes } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { dashboardCopy } from "@/lib/dashboard-copy";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { signInAs } from "@/lib/test-actor";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function call(cookie?: string) {
  const headers = new Headers({ host: "127.0.0.1:3000" });
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return GET(new Request("http://127.0.0.1:3000/api/dashboard", { headers }));
}

describe("GET /api/dashboard", () => {
  it("requires a session and rejects members", async () => {
    const anonymous = await call();
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: authCopy.apiAuthRequired,
      code: apiCodes.AUTH_REQUIRED,
    });

    const member = await signInAs("member", "api-member@ulix.test");
    const hidden = await signInAs("member", "api-hidden@ulix.test");
    await prisma.user.update({ where: { id: hidden.user.id }, data: { name: "Hidden Person" } });
    const owner = await signInAs("owner", "api-owner@ulix.test");
    const admin = await signInAs("admin", "api-admin@ulix.test");
    const project = await prisma.project.create({
      data: { name: "Website Coding", billable: true },
    });
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: hidden.user.id,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        endedAt: new Date(),
        billable: true,
        source: "manual",
      },
    });

    const forbidden = await call(member.cookie);
    expect(forbidden.status).toBe(403);
    const forbiddenBody = await forbidden.json();
    expect(forbiddenBody).toEqual({
      error: dashboardCopy.forbidden,
      code: apiCodes.FORBIDDEN,
    });
    expect(JSON.stringify(forbiddenBody)).not.toContain("Hidden Person");
    expect(JSON.stringify(forbiddenBody)).not.toContain("Website Coding");

    const team = await call(owner.cookie);
    expect(team.status).toBe(200);
    const teamBody = await team.json();
    expect(JSON.stringify(teamBody)).toContain("Hidden Person");
    expect(JSON.stringify(teamBody)).toContain("Website Coding");
    expect(JSON.stringify(teamBody)).not.toMatch(/\$|\bUSD\b|amountMinor|activity|idle|screenshot|productivity/i);

    const adminView = await call(admin.cookie);
    expect(adminView.status).toBe(200);
    expect(JSON.stringify(await adminView.json())).toContain("Hidden Person");
  });
});
