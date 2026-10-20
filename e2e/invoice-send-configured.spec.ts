import "./env";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createManualEntry } from "../src/lib/time-entries";
import { zonedDayStart } from "../src/lib/time-zone";
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

async function shot(page: Page, dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${name}.png`);
  const tmp = path.join("/tmp", `ulixdesk-${name}.png`);
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.screenshot({ path: tmp, fullPage: true });
      await copyFile(tmp, target);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

test("a configured send dialog records history through the capture transport", async ({ browser }, testInfo) => {
  test.skip(process.env.ULIXDESK_INVOICE_MAIL_CAPTURE !== "1", "Set ULIXDESK_INVOICE_MAIL_CAPTURE=1 to record this dialog.");
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: { email: "configured-send@ulix.test", name: "Configured Send", role: "member", passwordHash: "unused" },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: {
      name: "Configured Billing",
      currency: "USD",
      emails: { create: [{ email: "billing@configured.test", position: 0 }] },
    },
  });
  const project = await prisma.project.create({
    data: { name: "Configured site", clientId: client.id, billable: true },
  });
  await prisma.billRate.create({
    data: {
      scope: "client",
      clientId: client.id,
      amountMinor: 2500,
      currency: "USD",
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      createdById: owner.id,
    },
  });
  const startedAt = new Date(zonedDayStart("2026-10-08", "Asia/Colombo").getTime() + 9 * 60 * 60 * 1000);
  await createManualEntry(
    {
      projectId: project.id,
      startedAt,
      endedAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
      billable: true,
      note: null,
    },
    new Date("2026-10-15T12:00:00.000Z"),
    member.id,
  );

  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto("/invoices/new?time=1");
    await waitForHydration(page);
    await page.locator("#invoice-client").selectOption(client.id);
    await page.locator("#invoice-period-start").fill("2026-10-05");
    await page.locator("#invoice-period-end").fill("2026-10-11");
    await page.locator("#invoice-grouping").selectOption("period");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice LE/ })).toBeVisible();

    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("#invoice-send-dialog")).toBeVisible();
    await expect(page.locator("#invoice-mail-unconfigured")).toHaveCount(0);
    await expect(page.locator("#invoice-send-to")).toHaveValue("billing@configured.test");
    await expect(page.locator("#invoice-send-subject")).toHaveValue(/Invoice LE/);
    await expect(page.getByRole("button", { name: "Send email" })).toBeEnabled();
    await page.locator("#invoice-send-confirm").check();
    await shot(page, shots, "invoice-send-dialog-configured");

    await page.getByRole("button", { name: "Send email" }).click();
    await expect(page.getByText("Email sent.")).toBeVisible();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();
    await expect(page.locator("#invoice-email-history")).toContainText("billing@configured.test");
    await expect(page.locator("#invoice-email-history")).toContainText("Sent");
    await expect(page.locator("#invoice-status-history")).toContainText("Issued when the invoice was sent");
    const row = await prisma.invoiceEmail.findFirstOrThrow({ where: { success: true } });
    expect(row.toAddresses).toEqual(["billing@configured.test"]);
    await shot(page, shots, "invoice-send-history");
  } finally {
    await ownerContext.close();
    await prisma.$disconnect();
  }
});
