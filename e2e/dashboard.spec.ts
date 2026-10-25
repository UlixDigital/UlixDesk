import "./env";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth";
import { e2eEmail } from "./env";
import { todayInTimeZone, weekDates, zonedDateTimeToUtc } from "../src/lib/time-zone";

const zone = "Asia/Colombo";
const MONEY = /\$|\bUSD\b|\bEUR\b|\bJPY\b/;

test("owners see the team dashboard and members do not see money or other people", async ({ browser }) => {
  test.setTimeout(120_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: e2eEmail } });
  const maya = await prisma.user.create({
    data: { email: "dash-maya@ulix.test", name: "Maya Chen", role: "member", passwordHash: "unused" },
  });
  const jonah = await prisma.user.create({
    data: { email: "dash-jonah@ulix.test", name: "Jonah Ellis", role: "member", passwordHash: "unused" },
  });
  const member = await prisma.user.create({
    data: { email: "dash-member@ulix.test", name: "Ada Member", role: "member", passwordHash: "unused" },
  });
  const client = await prisma.client.create({ data: { name: "Dashboard Client", currency: "USD" } });
  const website = await prisma.project.create({
    data: { name: "Website Coding", billable: true, clientId: client.id },
  });
  const design = await prisma.project.create({
    data: { name: "Design Mockups", billable: true, clientId: client.id },
  });
  const paid = await prisma.project.create({
    data: { name: "Invoice Site", billable: true, clientId: client.id },
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
      projectId: paid.id,
      amountMinor: 12_000,
      currency: "USD",
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      createdById: owner.id,
    },
  });
  await prisma.budget.create({
    data: {
      scope: "project",
      projectId: paid.id,
      basis: "cost",
      amount: 200_000,
      currency: "USD",
      recurrence: "total",
      billableOnly: true,
      createdById: owner.id,
    },
  });

  const now = new Date();
  const today = todayInTimeZone(zone, now);
  for (const date of weekDates(today)) {
    if (date >= today) continue;
    const startedAt = zonedDateTimeToUtc(date, "09:00", zone);
    if (!startedAt || startedAt >= now) continue;
    const endedAt = new Date(startedAt.getTime() + 2 * 60 * 60 * 1000);
    if (endedAt > now) continue;
    await prisma.timeEntry.create({
      data: {
        projectId: design.id,
        userId: jonah.id,
        todoId: null,
        startedAt,
        endedAt,
        billable: true,
        source: "manual",
      },
    });
  }
  const closedStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const closedEnd = new Date(closedStart.getTime() + 4 * 60 * 60 * 1000);
  if (closedEnd < now) {
    await prisma.timeEntry.create({
      data: {
        projectId: paid.id,
        userId: maya.id,
        todoId: null,
        startedAt: closedStart,
        endedAt: closedEnd,
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
      startedAt: new Date(now.getTime() - 45 * 60 * 1000),
      endedAt: null,
      billable: true,
      source: "timer",
    },
  });
  await prisma.runningTimer.create({ data: { id: maya.id, timeEntryId: running.id } });

  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link").first()).toHaveText(
      "Dashboard",
    );
    await expect(page.getByRole("banner", { name: "Timer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ALL", exact: true })).toHaveAttribute("aria-current", "page");
    const online = page.getByRole("region", { name: "Who is online" });
    await expect(online).toContainText("Maya Chen");
    await expect(online).toContainText("Website Coding");
    await expect(online).toContainText("Homepage hero");
    await expect(online.getByText(/\d+:\d{2}:\d{2}/).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Summary" })).toContainText(/\d+ \/ \d+ online/);
    await expect(page.getByRole("img", { name: "Daily work total line graph" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Projects" })).toContainText("Website Coding");
    await expect(page.getByRole("region", { name: "Projects" }).getByRole("link", { name: /View report/ })).toHaveAttribute(
      "href",
      "/reports/time-activity",
    );
    await expect(page.getByRole("region", { name: "Team hours today" })).toContainText("Jonah Ellis");
    await expect(page.getByRole("region", { name: "Project budgets" })).toContainText("$480.00");

    await page.getByRole("button", { name: "Bar", exact: true }).click();
    await expect(page.getByRole("img", { name: "Daily work total bar chart" })).toBeVisible();
    await page.getByRole("button", { name: "Line", exact: true }).click();
    await expect(page.getByRole("img", { name: "Daily work total line graph" })).toBeVisible();

    await page.getByRole("link", { name: "ME", exact: true }).click();
    await expect(page.getByRole("link", { name: "ME", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Who is online" })).not.toContainText("Maya Chen");
    await expect(page.getByRole("region", { name: "Team hours today" })).not.toContainText("Jonah Ellis");
    await expect(page.getByRole("region", { name: "Project budgets" })).not.toContainText("$");

    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    const response = await memberPage.goto("/dashboard?scope=all");
    expect(response?.status()).toBe(200);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(memberPage.getByRole("link", { name: "ALL", exact: true })).toHaveCount(0);
    const visible = await memberPage.locator("#main-content").innerText();
    expect(visible).not.toContain("Maya Chen");
    expect(visible).not.toContain("Jonah Ellis");
    expect(visible).not.toMatch(MONEY);
    const denied = await memberPage.request.get("/api/dashboard?scope=all");
    expect(denied.status()).toBe(403);
    expect(await denied.text()).not.toMatch(MONEY);
    expect(await denied.text()).not.toContain("Maya Chen");
    const own = await memberPage.request.get("/api/dashboard?scope=me");
    expect(own.status()).toBe(200);
    const ownText = await own.text();
    expect(ownText).not.toMatch(MONEY);
    expect(ownText).not.toContain("Maya Chen");
  } finally {
    await ownerContext.close();
    await memberContext.close();
    const userIds = [maya.id, jonah.id, member.id];
    await prisma.runningTimer.deleteMany({ where: { id: { in: userIds } } });
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [website.id, design.id, paid.id] } } });
    await prisma.todoAssignee.deleteMany({ where: { todoId: todo.id } });
    await prisma.todo.deleteMany({ where: { id: todo.id } });
    await prisma.budget.deleteMany({ where: { projectId: paid.id } });
    await prisma.billRate.deleteMany({ where: { projectId: paid.id } });
    await prisma.project.deleteMany({ where: { id: { in: [website.id, design.id, paid.id] } } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.session.deleteMany({ where: { userId: { in: [...userIds, owner.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
