import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadDashboard } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";
import { zonedDateTimeToUtc } from "@/lib/time-zone";

const zone = "Asia/Colombo";
const now = zonedDateTimeToUtc("2026-10-23", "15:00", zone)!;
const MONEY = /\$|\bUSD\b|\bEUR\b|\bGBP\b|\bJPY\b|amountMinor|rateMinor/;

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const owner = await createTestUser("owner", "dash-owner@ulix.test");
  const admin = await createTestUser("admin", "dash-admin@ulix.test");
  const maya = await createTestUser("member", "dash-maya@ulix.test");
  const jonah = await createTestUser("member", "dash-jonah@ulix.test");
  await prisma.user.update({ where: { id: owner.id }, data: { name: "Avery Lane" } });
  await prisma.user.update({ where: { id: admin.id }, data: { name: "Riley Admin" } });
  await prisma.user.update({ where: { id: maya.id }, data: { name: "Maya Chen" } });
  await prisma.user.update({ where: { id: jonah.id }, data: { name: "Jonah Ellis" } });

  const client = await prisma.client.create({ data: { name: "Northwind", currency: "USD" } });
  const website = await prisma.project.create({
    data: { name: "Website Coding", billable: true, clientId: client.id },
  });
  const design = await prisma.project.create({
    data: { name: "Design Mockups", billable: true, clientId: client.id },
  });
  const consult = await prisma.project.create({
    data: { name: "Client Consultation", billable: true, clientId: client.id },
  });
  const notes = await prisma.project.create({
    data: { name: "Notes", billable: true, clientId: client.id },
  });
  const todo = await prisma.todo.create({
    data: {
      projectId: website.id,
      title: "Homepage hero",
      status: "open",
      createdById: owner.id,
      assignees: { create: [{ userId: maya.id }] },
    },
  });
  await prisma.billRate.create({
    data: {
      scope: "project",
      projectId: website.id,
      amountMinor: 10_000,
      currency: "USD",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdById: owner.id,
    },
  });
  await prisma.budget.create({
    data: {
      scope: "project",
      projectId: website.id,
      basis: "cost",
      amount: 100_000,
      currency: "USD",
      recurrence: "total",
      billableOnly: true,
      createdById: owner.id,
    },
  });
  await prisma.budget.create({
    data: {
      scope: "project",
      projectId: design.id,
      basis: "hours",
      amount: 20 * 3600,
      recurrence: "total",
      billableOnly: true,
      createdById: owner.id,
    },
  });

  const blocks: Array<{
    userId: string;
    projectId: string;
    todoId?: string;
    start: string;
    end: string;
    day: string;
  }> = [
    { userId: owner.id, projectId: consult.id, day: "2026-10-22", start: "09:00", end: "12:00" },
    { userId: maya.id, projectId: website.id, todoId: todo.id, day: "2026-10-19", start: "09:00", end: "12:00" },
    { userId: jonah.id, projectId: design.id, day: "2026-10-20", start: "10:00", end: "14:00" },
    { userId: jonah.id, projectId: design.id, day: "2026-10-23", start: "08:00", end: "10:00" },
    { userId: maya.id, projectId: notes.id, day: "2026-10-12", start: "09:00", end: "10:00" },
  ];
  for (const block of blocks) {
    await prisma.timeEntry.create({
      data: {
        projectId: block.projectId,
        userId: block.userId,
        todoId: block.todoId,
        startedAt: zonedDateTimeToUtc(block.day, block.start, zone)!,
        endedAt: zonedDateTimeToUtc(block.day, block.end, zone)!,
        billable: true,
        source: "manual",
      },
    });
  }
  const running = await prisma.timeEntry.create({
    data: {
      projectId: website.id,
      userId: maya.id,
      todoId: todo.id,
      startedAt: zonedDateTimeToUtc("2026-10-23", "13:00", zone)!,
      endedAt: null,
      billable: true,
      source: "timer",
    },
  });
  await prisma.runningTimer.create({ data: { id: maya.id, timeEntryId: running.id } });
  return { owner, admin, maya, jonah };
}

describe("loadDashboard", () => {
  it("gives owners the team week, the live timer, and budget money", async () => {
    const { owner } = await seed();
    const loaded = await loadDashboard({ actor: owner, scope: "all", now });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const dashboard = loaded.dashboard;
    expect(dashboard.scope).toBe("all");
    expect(dashboard.canChooseScope).toBe(true);
    expect(dashboard.showMoney).toBe(true);
    expect(dashboard.kpis.workedTodayMs).toBe(4 * 3_600_000);
    expect(dashboard.kpis.workedWeekMs).toBe(14 * 3_600_000);
    expect(dashboard.kpis.online).toBe(1);
    expect(dashboard.kpis.teamSize).toBe(4);
    expect(dashboard.kpis.projectsWorked).toBe(3);
    expect(dashboard.online[0]).toMatchObject({
      name: "Maya Chen",
      projectName: "Website Coding",
      todoTitle: "Homepage hero",
    });
    expect(dashboard.projects.map((project) => project.name)).toEqual([
      "Design Mockups",
      "Website Coding",
      "Client Consultation",
    ]);
    expect(dashboard.budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Website Coding",
          basis: "cost",
          spentLabel: "$300.00",
          budgetLabel: "$1,000.00",
        }),
        expect.objectContaining({
          name: "Design Mockups",
          basis: "hours",
          spentLabel: "6:00:00",
          budgetLabel: "20:00:00",
        }),
      ]),
    );
  });

  it("scopes an owner to their own rows on me", async () => {
    const { owner } = await seed();
    const loaded = await loadDashboard({ actor: owner, scope: "me", now });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.dashboard.team.map((person) => person.name)).toEqual(["Avery Lane"]);
    expect(loaded.dashboard.kpis.online).toBe(0);
    expect(JSON.stringify(loaded.dashboard)).not.toContain("Maya Chen");
    expect(JSON.stringify(loaded.dashboard)).not.toContain("Jonah Ellis");
  });

  it("refuses team data and money for a member", async () => {
    const { maya, admin } = await seed();
    const denied = await loadDashboard({ actor: maya, scope: "all", now });
    expect(denied).toEqual({ ok: false, error: "forbidden" });

    const mine = await loadDashboard({ actor: maya, scope: "me", now });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    expect(mine.dashboard.showMoney).toBe(false);
    expect(mine.dashboard.canChooseScope).toBe(false);
    expect(mine.dashboard.team.map((person) => person.name)).toEqual(["Maya Chen"]);
    expect(mine.dashboard.kpis.online).toBe(1);
    expect(mine.dashboard.budgets).toEqual([]);
    const json = JSON.stringify(mine.dashboard);
    expect(json).not.toMatch(MONEY);
    expect(json).not.toContain("Jonah Ellis");
    expect(json).not.toContain("Avery Lane");
    expect(json).not.toContain("Riley Admin");

    const asAdmin = await loadDashboard({ actor: admin, scope: "all", now });
    expect(asAdmin.ok).toBe(true);
    if (!asAdmin.ok) return;
    expect(asAdmin.dashboard.online[0]?.name).toBe("Maya Chen");
    expect(JSON.stringify(asAdmin.dashboard)).toContain("$300.00");
  });
});
