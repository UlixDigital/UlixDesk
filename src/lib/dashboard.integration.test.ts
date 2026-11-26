import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadDashboard } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";
import { zonedDateTimeToUtc } from "@/lib/time-zone";

const zone = "Asia/Colombo";
const now = zonedDateTimeToUtc("2026-10-23", "15:00", zone)!;
const hour = 3_600_000;

beforeEach(async () => {
  await resetTestDatabase();
  await prisma.workspaceSettings.create({
    data: { id: "workspace", timeZone: zone },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("loadDashboard", () => {
  it("rejects a member before returning team time", async () => {
    await createTestUser("member", "dash-member@ulix.test");
    const loaded = await loadDashboard({ role: "member", now });
    expect(loaded).toEqual({ ok: false, error: "forbidden" });
  });

  it("reads running timers, clients, to-dos, and the last project outside this week", async () => {
    const owner = await createTestUser("owner", "dash-owner@ulix.test");
    const maya = await createTestUser("member", "dash-maya@ulix.test");
    const jonah = await createTestUser("member", "dash-jonah@ulix.test");
    const hidden = await createTestUser("member", "dash-hidden@ulix.test");
    await prisma.user.update({ where: { id: owner.id }, data: { name: "Avery Lane" } });
    await prisma.user.update({ where: { id: maya.id }, data: { name: "Maya Chen" } });
    await prisma.user.update({ where: { id: jonah.id }, data: { name: "Jonah Ellis" } });
    await prisma.user.update({
      where: { id: hidden.id },
      data: { name: "Hidden Person", deactivatedAt: now },
    });

    const northwind = await prisma.client.create({ data: { name: "Northwind", currency: "USD" } });
    const brightpath = await prisma.client.create({ data: { name: "Brightpath", currency: "USD" } });
    const website = await prisma.project.create({
      data: { name: "Website Coding", billable: true, clientId: northwind.id },
    });
    const design = await prisma.project.create({
      data: { name: "Design Mockups", billable: true, clientId: brightpath.id },
    });
    const secret = await prisma.project.create({
      data: { name: "Secret Project", billable: true, clientId: northwind.id },
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
    await prisma.timeEntry.create({
      data: {
        projectId: website.id,
        userId: maya.id,
        todoId: todo.id,
        note: "Timer note",
        startedAt: zonedDateTimeToUtc("2026-10-23", "13:00", zone)!,
        endedAt: null,
        billable: true,
        source: "timer",
      },
    });
    await prisma.timeEntry.create({
      data: {
        projectId: design.id,
        userId: jonah.id,
        note: "Archive review",
        startedAt: zonedDateTimeToUtc("2026-09-01", "09:00", zone)!,
        endedAt: zonedDateTimeToUtc("2026-09-01", "10:00", zone)!,
        billable: true,
        source: "manual",
      },
    });
    await prisma.timeEntry.create({
      data: {
        projectId: secret.id,
        userId: hidden.id,
        startedAt: zonedDateTimeToUtc("2026-10-23", "08:00", zone)!,
        endedAt: zonedDateTimeToUtc("2026-10-23", "13:00", zone)!,
        billable: true,
        source: "manual",
      },
    });

    const loaded = await loadDashboard({ role: "admin", now });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const dashboard = loaded.dashboard;
    expect(dashboard.timeZone).toBe(zone);
    expect(dashboard.summary.workedTodayMs).toBe(2 * hour);
    expect(dashboard.summary.projectsWorked).toBe(1);
    expect(JSON.stringify(dashboard)).not.toMatch(/\$|\bUSD\b|amountMinor|Secret Project|Hidden Person/);

    const mayaRow = dashboard.online.find((person) => person.userId === maya.id);
    const jonahRow = dashboard.online.find((person) => person.userId === jonah.id);
    expect(mayaRow).toMatchObject({
      working: true,
      projectName: "Website Coding",
      clientName: "Northwind",
      detail: "Homepage hero",
    });
    expect(jonahRow).toMatchObject({
      working: false,
      projectName: "Design Mockups",
      clientName: "Brightpath",
      detail: "Archive review",
      todayMs: 0,
      weekMs: 0,
    });
    expect(dashboard.online.map((person) => person.name)).not.toContain("Hidden Person");
    expect(dashboard.projects).toEqual([
      expect.objectContaining({ projectName: "Website Coding", clientName: "Northwind", ms: 2 * hour }),
    ]);
  });
});
