import "./env";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createManualEntry } from "../src/lib/time-entries";
import { signIn } from "./auth";

function artifactDir(testInfo: TestInfo) {
  return process.env.ULIXDESK_E2E_ARTIFACTS ?? testInfo.outputDir;
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    if (!form) return false;
    return Object.getOwnPropertyNames(form).some((key) => key.startsWith("__react"));
  });
}

async function saveShot(page: Page, dir: string, selector: string | null, name: string) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  if (selector) {
    await page.locator(selector).screenshot({ path: file });
    return;
  }
  await page.screenshot({ path: file, fullPage: true });
}

test("an owner manages to-dos and the timer can add one for reuse", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const noah = await prisma.user.create({
    data: {
      email: "noah-todo@ulix.test",
      name: "Noah Todo",
      role: "member",
      passwordHash: "unused",
    },
  });
  const website = await prisma.project.create({
    data: { name: "Todo Website", billable: true },
  });
  const shots = artifactDir(testInfo);
  const context = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(context, prisma, owner.email);
    const page = await context.newPage();
    await page.goto(`/projects/${website.id}/todos`);
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Todo Website" })).toBeVisible();

    await page.locator("#todo-title").fill("Write the brief");
    await page.getByRole("checkbox", { name: "Noah Todo" }).check();
    await page.getByRole("button", { name: "Add to-do" }).click();
    await expect(page.getByRole("heading", { name: "Write the brief" })).toBeVisible();
    await saveShot(page, shots, null, "todos-tab");

    await signIn(memberContext, prisma, noah.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/projects/${website.id}/todos`);
    await waitForHydration(memberPage);
    const assigned = memberPage.locator("li").filter({
      has: memberPage.getByRole("heading", { name: "Write the brief" }),
    });
    await expect(assigned.getByRole("button", { name: "Mark done" })).toBeVisible();
    await expect(assigned.locator("input[name=title]")).toHaveCount(0);
    await expect(assigned.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(assigned.getByRole("button", { name: "Archive" })).toHaveCount(0);
    await expect(assigned.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(memberPage.locator("#todo-title")).toBeVisible();

    const brief = page.locator("li").filter({ has: page.getByRole("heading", { name: "Write the brief" }) });
    await brief.locator("input[name=title]").fill("Write the homepage brief");
    await brief.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Write the homepage brief" })).toBeVisible();

    await page.locator("#timer-project").selectOption(website.id);
    await expect(page.getByRole("listbox", { name: "My open to-dos" })).toBeVisible();
    await page.locator("#timer-todo-search").fill("Design the header");
    await page.getByRole("button", { name: "Add “Design the header”" }).click();
    await expect(page.getByRole("option", { name: "Design the header", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.locator("#timer-todo-search").fill("Another header");
    await expect(page.getByRole("button", { name: "Add “Another header”" })).toBeVisible();
    await page.locator("#timer-todo-search").fill("");
    await saveShot(page, shots, "[data-testid=timer-todo-picker]", "todo-picker");

    const edited = page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Write the homepage brief" }) });
    await edited.getByRole("button", { name: "Mark done" }).click();
    await expect(edited.getByText("Done", { exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Write the homepage brief" })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Design the header", exact: true })).toBeVisible();

    await edited.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByRole("option", { name: "Write the homepage brief" })).toBeVisible();
    await edited.getByRole("button", { name: "Archive" }).click();
    await expect(edited.getByText("Archived", { exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Write the homepage brief" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Write the homepage brief" })).toBeVisible();

    await page.locator("#todo-title").fill("Scratch note");
    await page.getByRole("button", { name: "Add to-do" }).click();
    const scratch = page.locator("li").filter({ has: page.getByRole("heading", { name: "Scratch note" }) });
    await expect(scratch).toBeVisible();
    await scratch.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Scratch note" })).toHaveCount(0);

    const header = await prisma.todo.findFirstOrThrow({
      where: { projectId: website.id, title: "Design the header" },
    });
    await createManualEntry(
      {
        projectId: website.id,
        startedAt: new Date("2026-10-22T09:00:00.000Z"),
        endedAt: new Date("2026-10-22T10:00:00.000Z"),
        billable: true,
        note: "An hour on the header",
        todoId: header.id,
      },
      new Date("2026-10-22T12:00:00.000Z"),
      owner.id,
    );
    await page.reload();
    await waitForHydration(page);
    const tracked = page.locator("li").filter({ has: page.getByRole("heading", { name: "Design the header" }) });
    await expect(tracked.getByRole("button", { name: "Delete" })).toBeDisabled();
    await expect(tracked.getByText("This to-do has time, so it can't be deleted.")).toBeVisible();
    expect(noah.role).toBe("member");
  } finally {
    await context.close();
    await memberContext.close();
    await prisma.$disconnect();
  }
});
