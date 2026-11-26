import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth";
import { todayInTimeZone, zonedDayStart } from "../src/lib/time-zone";

const zone = "Asia/Colombo";
const prisma = new PrismaClient();

type Seed = {
  mayaEmail: string;
  jonahEmail: string;
  adminEmail: string;
  clientId: string;
  projectIds: string[];
  userIds: string[];
  previousZone: string | null;
  hadSettings: boolean;
};

let seed: Seed;

function todayEntry(minutes: number) {
  const today = todayInTimeZone(zone);
  const start = zonedDayStart(today, zone);
  const endMs = Math.min(Date.now() - 1000, start.getTime() + minutes * 60 * 1000);
  const end = new Date(Math.max(endMs, start.getTime() + 1000));
  return { startedAt: start, endedAt: end };
}

test.beforeAll(async () => {
  const existing = await prisma.workspaceSettings.findUnique({ where: { id: "workspace" } });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: zone },
    create: { id: "workspace", timeZone: zone },
  });
  const maya = await prisma.user.create({
    data: { email: "maya-dash@ulix.test", name: "Maya Chen", role: "member", passwordHash: "unused" },
  });
  const jonah = await prisma.user.create({
    data: { email: "jonah-dash@ulix.test", name: "Jonah Ellis", role: "member", passwordHash: "unused" },
  });
  const admin = await prisma.user.create({
    data: { email: "riley-dash@ulix.test", name: "Riley Admin", role: "admin", passwordHash: "unused" },
  });
  const client = await prisma.client.create({ data: { name: "Northwind", currency: "USD" } });
  const website = await prisma.project.create({
    data: { name: "Website Coding", billable: true, clientId: client.id },
  });
  const design = await prisma.project.create({
    data: { name: "Design Mockups", billable: true, clientId: client.id },
  });
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "owner" } });
  const todo = await prisma.todo.create({
    data: {
      projectId: website.id,
      title: "Homepage hero",
      status: "open",
      createdById: owner.id,
      assignees: { create: [{ userId: maya.id }] },
    },
  });
  const tracked = todayEntry(45);
  await prisma.timeEntry.create({
    data: {
      projectId: website.id,
      userId: maya.id,
      todoId: todo.id,
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      endedAt: null,
      billable: true,
      source: "timer",
    },
  });
  await prisma.timeEntry.create({
    data: {
      projectId: design.id,
      userId: jonah.id,
      note: "Logo exploration",
      startedAt: tracked.startedAt,
      endedAt: tracked.endedAt,
      billable: true,
      source: "manual",
    },
  });
  seed = {
    mayaEmail: maya.email,
    jonahEmail: jonah.email,
    adminEmail: admin.email,
    clientId: client.id,
    projectIds: [website.id, design.id],
    userIds: [maya.id, jonah.id, admin.id],
    previousZone: existing?.timeZone ?? null,
    hadSettings: existing !== null,
  };
});

test.afterAll(async () => {
  const emails = ["maya-dash@ulix.test", "jonah-dash@ulix.test", "riley-dash@ulix.test"];
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const projects = await prisma.project.findMany({
    where: { name: { in: ["Website Coding", "Design Mockups", "Beacon Redesign"] } },
    select: { id: true, clientId: true },
  });
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length > 0) {
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.todo.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  }
  const clientIds = [...new Set(projects.map((project) => project.clientId).filter((id): id is string => Boolean(id)))];
  if (clientIds.length > 0) await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  if (userIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (seed?.hadSettings && seed.previousZone) {
    await prisma.workspaceSettings.update({
      where: { id: "workspace" },
      data: { timeZone: seed.previousZone },
    });
  }
  await prisma.$disconnect();
});

function expectNoScores(text: string) {
  expect(text).not.toMatch(/\d+(\.\d+)?\s*%/);
  expect(text).not.toMatch(/\b(idle|productivity|screenshot|organization)\b/i);
  expect(text).not.toMatch(/\$|\bUSD\b/);
}

test("an owner lands on the dashboard and can refresh it", async ({ page }) => {
  await signIn(page.context(), prisma);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await expect(page.getByText("Worked today")).toBeVisible();
  await expect(page.getByText("Projects worked")).toBeVisible();
  await expect(page.getByText("Worked this week")).toBeVisible();
  await expect(page.getByText(/vs yesterday/)).toBeVisible();
  await expect(page.getByText(/vs last week/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who's online" })).toBeVisible();
  await expect(page.getByText("Last updated")).toBeVisible();
  const maya = page.getByRole("row", { name: /Maya Chen/ });
  await expect(maya).toContainText("Working");
  await expect(maya).toContainText("Website Coding");
  await expect(maya).toContainText("Northwind");
  await expect(maya).toContainText("Homepage hero");
  const jonah = page.getByRole("row", { name: /Jonah Ellis/ });
  await expect(jonah).toContainText("Not working");
  await expect(jonah).toContainText("Design Mockups");
  await expect(jonah).toContainText("Logo exploration");
  await expect(page.getByRole("heading", { name: "Current project activity" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View report" })).toHaveAttribute("href", "/reports");
  expectNoScores(await page.locator("#main-content").innerText());

  const api = await page.request.get("/api/dashboard");
  expect(api.status()).toBe(200);

  const beacon = await prisma.project.create({
    data: { name: "Beacon Redesign", billable: true, clientId: seed.clientId },
  });
  seed.projectIds.push(beacon.id);
  const tracked = todayEntry(20);
  await prisma.timeEntry.create({
    data: {
      projectId: beacon.id,
      userId: (await prisma.user.findUniqueOrThrow({ where: { email: seed.jonahEmail } })).id,
      note: "Refresh check",
      startedAt: tracked.startedAt,
      endedAt: tracked.endedAt,
      billable: true,
      source: "manual",
    },
  });

  const response = page.waitForResponse((result) => result.url().includes("/api/dashboard") && result.ok());
  await page.getByRole("button", { name: "Refresh" }).click();
  await response;
  await expect(page.getByText("Beacon Redesign")).toBeVisible();
  await expect(page.getByText("Last updated")).toBeVisible();
  expectNoScores(await page.locator("#main-content").innerText());
});

test("an admin sees the same dashboard", async ({ page }) => {
  await signIn(page.context(), prisma, seed.adminEmail);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const maya = page.getByRole("row", { name: /Maya Chen/ });
  await expect(maya).toContainText("Working");
  await expect(maya).toContainText("Northwind");
  expectNoScores(await page.locator("#main-content").innerText());
});

test("a member keeps the clients landing and cannot read the dashboard", async ({ page }) => {
  await signIn(page.context(), prisma, seed.mayaEmail);
  await page.goto("/");
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Clients", exact: true })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0);

  const api = await page.request.get("/api/dashboard");
  expect(api.status()).toBe(403);
  const body = await api.json();
  expect(body).toMatchObject({ code: "FORBIDDEN" });
  expect(JSON.stringify(body)).not.toContain("Jonah Ellis");
  expect(JSON.stringify(body)).not.toContain("Website Coding");
});
