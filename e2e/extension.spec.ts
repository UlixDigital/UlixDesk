import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, expect, test } from "@playwright/test";
import { acceptChromePermissionDialog } from "./chrome-allow";
import { e2eDatabaseUrl, e2eEmail, e2eOrigin, e2ePassword } from "./env";

if (process.env.DATABASE_URL !== e2eDatabaseUrl) {
  throw new Error(`e2e must use ${e2eDatabaseUrl}, got ${process.env.DATABASE_URL ?? "(unset)"}`);
}

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.skip(Boolean(process.env.CI), "The unpacked extension needs a display, xdotool, and ffmpeg.");

test("loads the unpacked extension and starts and stops a timer", async () => {
  const project = await prisma.project.create({
    data: { name: "Extension E2E Project", billable: true },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: e2eEmail } });
  const token = `ulixdesk_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.accessToken.create({
    data: { name: "E2E extension", tokenHash, userId: owner.id },
  });
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-ext-"));
  const extensionDir = path.resolve("extension/dist");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("https://desk.ulixdigital.com")).toBeVisible();

    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByRole("heading", { name: "Connect to UlixDesk" })).toBeVisible();
    await page.locator("#server-url").fill(e2eOrigin);
    await page.locator("#access-token").fill(token);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Saved. Grant permission for this server, then test the connection."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Grant permission" }).click();
    acceptChromePermissionDialog();
    await expect(page.getByText("Chrome can reach this server.")).toBeVisible();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(
      page.getByText("Connected. The token can read projects from this server."),
    ).toBeVisible();

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.locator("#project").selectOption({ label: "Extension E2E Project" });
    await page.locator("#note").fill("From the extension");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText("Timer running", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Extension E2E Project" })).toBeVisible();
    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByText("No timer running")).toBeVisible();

    const entry = await prisma.timeEntry.findFirst({
      where: { projectId: project.id, note: "From the extension" },
    });
    expect(entry?.source).toBe("timer");
    expect(entry?.endedAt).not.toBeNull();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    await prisma.runningTimer.deleteMany();
    await prisma.timeEntry.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.accessToken.deleteMany({ where: { tokenHash } });
  }
});

test("signs in from the popup, tracks time, signs out, and drops a revoked credential", async () => {
  const project = await prisma.project.create({
    data: { name: "Extension Sign-in Project", billable: true },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: e2eEmail } });
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-ext-"));
  const extensionDir = path.resolve("extension/dist");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByRole("button", { name: "Custom server" }).click();
    await page.locator("#server-url").fill(e2eOrigin);
    await page.locator("#email").fill(e2eEmail);
    await page.locator("#password").fill(e2ePassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    acceptChromePermissionDialog();
    await expect(page.getByText("E2E Owner")).toBeVisible();
    await expect(page.getByText(e2eEmail)).toBeVisible();

    await page.locator("#project").selectOption({ label: "Extension Sign-in Project" });
    await page.locator("#note").fill("Signed in from the popup");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText("Timer running", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Extension Sign-in Project" })).toBeVisible();

    const running = await prisma.timeEntry.findFirstOrThrow({
      where: { projectId: project.id, note: "Signed in from the popup" },
    });
    await prisma.timeEntry.update({
      where: { id: running.id },
      data: { startedAt: new Date(Date.now() - 200) },
    });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByText("Let the timer run for at least a second before stopping.")).toBeVisible();
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: running.id } })).toMatchObject({
      endedAt: null,
    });

    await prisma.timeEntry.update({
      where: { id: running.id },
      data: { startedAt: new Date(Date.now() - 5000) },
    });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByText("No timer running")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(await prisma.extensionSession.count({ where: { userId: owner.id, revokedAt: null } })).toBe(0);

    await page.locator("#email").fill(e2eEmail);
    await page.locator("#password").fill(e2ePassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("E2E Owner")).toBeVisible();
    await prisma.extensionSession.updateMany({
      where: { userId: owner.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await page.reload();
    await expect(page.getByText("This sign-in is no longer valid. Sign in again.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    await prisma.runningTimer.deleteMany();
    await prisma.timeEntry.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.extensionSession.deleteMany({ where: { userId: owner.id } });
  }
});
