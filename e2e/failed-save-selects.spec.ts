import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { e2eDatabaseUrl, e2eOrigin } from "./env";

if (process.env.DATABASE_URL !== e2eDatabaseUrl) {
  throw new Error(`e2e must use ${e2eDatabaseUrl}, got ${process.env.DATABASE_URL ?? "(unset)"}`);
}

const prisma = new PrismaClient();
const TIMER_PROJECT_KEY = "ulixdesk-timer-project";

let clientId = "";
let projectId = "";
let timerProjectId = "";

async function stopWorkspaceTimer() {
  const running = await prisma.runningTimer.findUnique({
    where: { id: "workspace" },
    include: { timeEntry: true },
  });
  if (!running) return;
  const started = running.timeEntry.startedAt.getTime();
  await prisma.timeEntry.update({
    where: { id: running.timeEntryId },
    data: { endedAt: new Date(Math.max(Date.now(), started + 1000)) },
  });
  await prisma.runningTimer.delete({ where: { id: "workspace" } });
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    if (!form) return false;
    return Object.getOwnPropertyNames(form).some((key) => key.startsWith("__react"));
  });
}

test.beforeAll(async () => {
  await stopWorkspaceTimer();
  const client = await prisma.client.create({
    data: { name: "E2E Select Client" },
  });
  const project = await prisma.project.create({
    data: { name: "E2E Select Project", clientId: client.id, billable: true },
  });
  const timerProject = await prisma.project.create({
    data: { name: "E2E Timer Project", clientId: client.id, billable: true },
  });
  clientId = client.id;
  projectId = project.id;
  timerProjectId = timerProject.id;
});

test.afterAll(async () => {
  await stopWorkspaceTimer();
  await prisma.timeEntry.deleteMany({
    where: { projectId: { in: [projectId, timerProjectId].filter(Boolean) } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: [projectId, timerProjectId].filter(Boolean) } },
  });
  if (clientId) await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "ulixdesk-timezone",
      value: "UTC",
      url: e2eOrigin,
    },
  ]);
});

async function saveTimeAgain(page: Page) {
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("Choose a project.", { exact: true })).toHaveCount(0);
  await expect(page.locator("#entry-project")).toHaveValue(projectId);
}

test("keeps the Add time project after equal times, a future end, and a long note", async ({
  page,
}) => {
  await page.goto("/timesheets/new?date=2026-10-08");
  await waitForHydration(page);
  await page.locator("#entry-project").selectOption(projectId);
  await page.locator("#entry-start").fill("09:00");
  await page.locator("#entry-end").fill("09:00");
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("End time must be after the start time.")).toBeVisible();
  await expect(page.locator("#entry-project")).toHaveValue(projectId);
  await saveTimeAgain(page);

  await page.goto("/timesheets/new?date=2099-01-01");
  await waitForHydration(page);
  await page.locator("#entry-project").selectOption(projectId);
  await page.locator("#entry-date").fill("2099-01-01");
  await page.locator("#entry-start").fill("09:00");
  await page.locator("#entry-end").fill("10:00");
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("End time can't be in the future.")).toBeVisible();
  await expect(page.locator("#entry-project")).toHaveValue(projectId);
  await saveTimeAgain(page);

  await page.goto("/timesheets/new?date=2026-10-08");
  await waitForHydration(page);
  await page.locator("#entry-project").selectOption(projectId);
  await page.locator("#entry-start").fill("09:00");
  await page.locator("#entry-end").fill("10:00");
  await page.locator("#entry-note").evaluate((node) => {
    const textarea = node as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, "n".repeat(2001));
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("Note must be 2000 characters or fewer.")).toBeVisible();
  await expect(page.locator("#entry-project")).toHaveValue(projectId);
  await saveTimeAgain(page);
});

test("keeps the Add project client after a blank name, including keyboard selection", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await waitForHydration(page);
  await page.locator("#project-client").selectOption(clientId);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  await expect(page.locator("#project-client")).toHaveValue(clientId);
  await expect(page.locator("#project-client option:checked")).toHaveText("E2E Select Client");

  await page.goto("/projects/new");
  await waitForHydration(page);
  const client = page.locator("#project-client");
  await client.focus();
  await page.keyboard.press("ArrowDown");
  const selected = await client.inputValue();
  expect(selected).not.toBe("");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  await expect(client).toHaveValue(selected);
  await expect(client.locator("option:checked")).not.toHaveText("No client");
});

test("keeps the header timer project after start and stop", async ({ page }) => {
  await stopWorkspaceTimer();
  await page.goto("/timesheets");
  await waitForHydration(page);
  await page.locator("#timer-project").selectOption(timerProjectId);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("#timer-project")).toHaveValue(timerProjectId);
  await expect(page.getByText("Choose a project.", { exact: true })).toHaveCount(0);
  await expect(page.locator("#timer-project option:checked")).toHaveText(
    "E2E Timer Project · E2E Select Client",
  );
});

test("clears an archived header project with a visible message", async ({ page }) => {
  await stopWorkspaceTimer();
  await page.goto("/timesheets");
  await waitForHydration(page);
  await page.locator("#timer-project").selectOption(timerProjectId);
  await page.waitForFunction(
    ([key, id]) => window.sessionStorage.getItem(key) === id,
    [TIMER_PROJECT_KEY, timerProjectId] as const,
  );

  await prisma.project.update({
    where: { id: timerProjectId },
    data: { archivedAt: new Date() },
  });
  try {
    await page.reload();
    await waitForHydration(page);
    await expect(
      page.getByText("That project is no longer active. Choose another project."),
    ).toBeVisible();
    await expect(page.locator("#timer-project")).toHaveValue("");
    await expect(page.locator("#timer-project option:checked")).toHaveText("Project");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
    await expect(page.getByText("Choose a project.", { exact: true })).toHaveCount(0);
    await page.waitForFunction(
      (key) => window.sessionStorage.getItem(key) === null,
      TIMER_PROJECT_KEY,
    );
    await page.reload();
    await waitForHydration(page);
    await expect(
      page.getByText("That project is no longer active. Choose another project."),
    ).toHaveCount(0);
    await expect(page.getByText("Choose a project to start the timer.")).toBeVisible();
  } finally {
    await prisma.project.update({
      where: { id: timerProjectId },
      data: { archivedAt: null },
    });
  }
});

test("renders extension access before a token exists", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Extension access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New token" })).toBeVisible();
  await expect(page.getByText("No access tokens")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create token" })).toBeEnabled();
});

test("keeps a long token name inside the table and leaves Revoke on screen", async ({ page }) => {
  const name = "n".repeat(80);
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/settings");
  await page.locator("#token-name").fill(name);
  await page.getByRole("button", { name: "Create token" }).click();
  const nameCell = page.locator("table").getByTitle(name);
  await expect(nameCell).toBeVisible();
  await expect(nameCell).toHaveText(name);
  const revoke = page.getByRole("button", { name: `Revoke ${name}` });
  await expect(revoke).toBeVisible();
  const metrics = await page.locator("table").evaluate((table) => {
    const wrapper = table.parentElement;
    return {
      wrapperScroll: wrapper?.scrollWidth ?? -1,
      wrapperClient: wrapper?.clientWidth ?? -1,
      tableScroll: table.scrollWidth,
      tableClient: table.clientWidth,
    };
  });
  expect(metrics.tableScroll, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.wrapperClient + 1);
  expect(metrics.wrapperScroll, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.wrapperClient + 1);
  const revokeBox = await revoke.boundingBox();
  const viewport = page.viewportSize();
  expect(revokeBox).not.toBeNull();
  if (!revokeBox) return;
  expect(revokeBox.x + revokeBox.width).toBeLessThanOrEqual((viewport?.width ?? 768) + 1);
  await prisma.accessToken.deleteMany({ where: { name } });
});
