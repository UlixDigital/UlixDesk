import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { e2eDatabaseUrl, e2eOrigin } from "./env";

if (process.env.DATABASE_URL !== e2eDatabaseUrl) {
  throw new Error(`e2e must use ${e2eDatabaseUrl}, got ${process.env.DATABASE_URL ?? "(unset)"}`);
}

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("submits before JavaScript with POST instead of putting fields in the URL", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/projects/new");
  await expect(page.locator("form")).toHaveAttribute("method", /post/i);

  await page.getByRole("button", { name: "Create project" }).click();
  const blankUrl = new URL(page.url());
  expect(blankUrl.search).toBe("");
  expect(page.url()).not.toContain("name=");
  await expect(page.getByText("Name is required.")).toBeVisible();

  const name = `Early Click ${Date.now()}`;
  await page.goto("/projects/new");
  await page.locator("#project-name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("link", { name })).toBeVisible();

  await context.addCookies([
    { name: "ulixdesk-timezone", value: "UTC", url: e2eOrigin },
  ]);
  await page.goto("/timesheets/new?date=2026-10-08");
  await expect(page.locator("form").last()).toHaveAttribute("method", /post/i);
  await page.getByRole("button", { name: "Save time" }).click();
  expect(new URL(page.url()).search).not.toContain("projectId=");
  await expect(page.getByText("Choose a project.")).toBeVisible();

  await prisma.project.deleteMany({ where: { name } });
  await context.close();
});
