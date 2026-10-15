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

async function createDraft(page: Page, clientId: string, start: string, end: string) {
  await page.goto("/invoices/new");
  await waitForHydration(page);
  await page.locator("#invoice-client").selectOption(clientId);
  await page.locator("#invoice-period-start").fill(start);
  await page.locator("#invoice-period-end").fill(end);
  await page.locator("#invoice-grouping").selectOption("period");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /^Invoice LE/ })).toBeVisible();
}

test("an owner emails a draft only after SMTP is set, and a client opens the link", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "noah-send@ulix.test",
      name: "Noah Send",
      role: "member",
      passwordHash: "unused",
    },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: {
      name: "Northwind Billing",
      currency: "USD",
      address: "1 Harbor Street",
      emails: { create: [{ email: "billing@northwind.test", position: 0 }] },
    },
  });
  const project = await prisma.project.create({
    data: { name: "Harbor site", clientId: client.id, billable: true },
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
  const startedAt = new Date(zonedDayStart("2026-10-06", "Asia/Colombo").getTime() + 9 * 60 * 60 * 1000);
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
  const memberContext = await browser.newContext();
  const publicContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto(`/clients/${client.id}/edit`);
    await waitForHydration(page);
    await expect(page.locator("#client-email")).toBeVisible();
    await expect(page.getByRole("list", { name: "Billing emails" })).toContainText("billing@northwind.test");
    await shot(page, shots, "invoice-billing-emails");

    await createDraft(page, client.id, "2026-10-05", "2026-10-11");
    const invoiceUrl = new URL(page.url());
    const invoiceId = invoiceUrl.pathname.split("/").at(-1) ?? "";
    const number = (await page.getByRole("heading", { level: 1 }).textContent())?.replace("Invoice ", "") ?? "";

    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("#invoice-mail-unconfigured")).toContainText("Email is not set up");
    await expect(page.locator("#invoice-send-to")).toHaveValue("billing@northwind.test");
    await expect(page.locator("#invoice-send-subject")).toHaveValue(new RegExp(`Invoice ${number}`));
    await expect(page.locator("#invoice-send-body")).toContainText("USD 25.00");
    await expect(page.locator("#invoice-send-confirm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send email" })).toBeDisabled();
    await shot(page, shots, "invoice-send-dialog-unconfigured");

    await page.getByRole("button", { name: "Create client link" }).click();
    await expect(page.getByText("A client link is active.")).toBeVisible();
    const clientPath = await page.locator("#invoice-client-link").inputValue();
    expect(clientPath).toMatch(/\/v\/[A-Za-z0-9_-]{40,}$/);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("#invoice-send-dialog")).toBeVisible();
    await expect(page.locator("#invoice-mail-unconfigured")).toBeVisible();
    await expect(page.locator("#invoice-send-link")).toHaveValue(clientPath);
    await expect(page.getByRole("button", { name: "Copy link" }).first()).toBeEnabled();

    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();
    await expect(page.locator("#invoice-status-history")).toContainText("Marked as issued");
    await expect(page.locator("#invoice-status-history")).toContainText("Draft");
    await expect(page.locator("#invoice-status-history")).toContainText("Open");

    await page.locator("#invoice-void-reason").fill("Sent to the wrong client");
    await page.getByRole("button", { name: "Void invoice" }).click();
    await expect(page.getByText("Invoice voided.")).toBeVisible();
    await expect(page.getByText("This invoice is void.")).toBeVisible();
    await expect(page.getByText("It cannot be emailed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
    await expect(page.locator("#invoice-status-history")).toContainText("Sent to the wrong client");
    await shot(page, shots, "invoice-status-void");

    await page.locator("#invoice-reopen-reason").fill("Ready to send again");
    await page.getByRole("button", { name: "Reopen as draft" }).click();
    await expect(page.getByText("Invoice reopened as a draft.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await expect(page.locator("#invoice-status-history")).toContainText("Ready to send again");
    await shot(page, shots, "invoice-status-reopened");

    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();

    const clientPage = await publicContext.newPage();
    const opened = await clientPage.goto(clientPath);
    expect(opened?.status()).toBe(200);
    await expect(clientPage.locator("#public-invoice")).toBeVisible();
    await expect(clientPage.getByRole("heading", { name: `Invoice ${number}` })).toBeVisible();
    await expect(clientPage.getByText("Northwind Billing")).toBeVisible();
    await expect(clientPage.getByText("USD 25.00").first()).toBeVisible();
    await expect(clientPage.getByText("Status history")).toHaveCount(0);
    await expect(clientPage.getByText(owner.email)).toHaveCount(0);
    const publicPdf = await clientPage.request.get(`${clientPath}/pdf`);
    expect(publicPdf.status()).toBe(200);
    expect(publicPdf.headers()["x-robots-tag"]).toContain("noindex");
    expect((await publicPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await shot(clientPage, shots, "invoice-public");

    await prisma.invoiceEmail.create({
      data: {
        invoiceId,
        sentById: owner.id,
        toAddresses: ["billing@northwind.test"],
        ccAddresses: ["ap@northwind.test"],
        subject: `Invoice ${number} from Ulix Digital`,
        success: true,
      },
    });
    await page.reload();
    await expect(page.locator("#invoice-email-history")).toContainText("billing@northwind.test");
    await expect(page.locator("#invoice-email-history")).toContainText("ap@northwind.test");
    await expect(page.locator("#invoice-email-history")).toContainText("Sent");

    await page.locator("#invoice-void-reason").fill("Client asked to cancel");
    await page.getByRole("button", { name: "Void invoice" }).click();
    await expect(page.getByText("Invoice voided.")).toBeVisible();
    await clientPage.reload();
    await expect(clientPage.getByText("This invoice is void.")).toBeVisible();
    await shot(clientPage, shots, "invoice-public-void");

    await page.getByRole("button", { name: "Revoke link" }).click();
    await expect(page.getByText("Client link revoked.")).toBeVisible();
    const revoked = await publicContext.request.get(clientPath);
    expect(revoked.status()).toBe(404);
    const revokedPage = await clientPage.goto(clientPath);
    expect(revokedPage?.status()).toBe(404);
    await expect(clientPage.getByRole("heading", { name: "Invoice not found" })).toBeVisible();
    await expect(clientPage.getByText("This link is invalid or has been revoked.")).toBeVisible();
    await shot(clientPage, shots, "invoice-revoked-404");

    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/timesheets");
    await expect(memberPage.getByRole("link", { name: "Invoices" })).toHaveCount(0);
    await memberPage.goto("/invoices");
    await expect(memberPage.getByText("Only owners and admins can manage invoices.")).toBeVisible();
    await expect(memberPage.getByText("USD")).toHaveCount(0);
    const forbidden = await memberPage.request.get(`/invoices/${invoiceId}/pdf`);
    expect(forbidden.status()).toBe(403);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await publicContext.close();
    await prisma.$disconnect();
  }
});

test("an entry across a period boundary is billed on two invoices that match the report", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "boundary-member@ulix.test",
      name: "Boundary Member",
      role: "member",
      passwordHash: "unused",
    },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Boundary Client", currency: "USD" },
  });
  const project = await prisma.project.create({
    data: { name: "Overnight", clientId: client.id, billable: true },
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
  const zone = "Asia/Colombo";
  const startedAt = new Date(zonedDayStart("2026-09-13", zone).getTime() + (23 * 60 + 50) * 60 * 1000);
  const endedAt = new Date(zonedDayStart("2026-09-14", zone).getTime() + 20 * 60 * 1000);
  await createManualEntry(
    { projectId: project.id, startedAt, endedAt, billable: true, note: null },
    new Date("2026-09-20T12:00:00.000Z"),
    member.id,
  );

  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await createDraft(page, client.id, "2026-09-13", "2026-09-13");
    await expect(page.getByLabel("Total hours (qty) 1")).toHaveValue("0:10:00");
    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("USD 4.17").first()).toBeVisible();
    await expect(page.getByText("0:10:00")).toBeVisible();
    await shot(page, shots, "invoice-boundary-first");

    await createDraft(page, client.id, "2026-09-14", "2026-09-14");
    await expect(page.getByLabel("Total hours (qty) 1")).toHaveValue("0:20:00");
    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("USD 8.33").first()).toBeVisible();
    await expect(page.getByText("0:20:00")).toBeVisible();
    await shot(page, shots, "invoice-boundary-second");

    await page.goto(
      `/reports/time-activity?preset=custom&from=2026-09-13&to=2026-09-14&client=${client.id}&billable=billable`,
    );
    await expect(page.locator("tfoot")).toContainText("30m");
    await expect(page.locator("tfoot")).toContainText("USD 12.50");
    await shot(page, shots, "invoice-boundary-report");
  } finally {
    await ownerContext.close();
    await prisma.$disconnect();
  }
});

test("reopen refuses a void invoice after a billed time entry was deleted", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "reopen-delete@ulix.test",
      name: "Reopen Delete",
      role: "member",
      passwordHash: "unused",
    },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Reopen Client", currency: "USD" },
  });
  const project = await prisma.project.create({
    data: { name: "Reopen site", clientId: client.id, billable: true },
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
  const startedAt = new Date(zonedDayStart("2026-10-06", "Asia/Colombo").getTime() + 9 * 60 * 60 * 1000);
  const created = await createManualEntry(
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
    await createDraft(page, client.id, "2026-10-05", "2026-10-11");
    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();
    await page.locator("#invoice-void-reason").fill("Hold the invoice");
    await page.getByRole("button", { name: "Void invoice" }).click();
    await expect(page.getByText("Invoice voided.")).toBeVisible();

    await prisma.timeEntry.delete({ where: { id: created.entry.id } });
    await page.locator("#invoice-reopen-reason").fill("Put the time back");
    await page.getByRole("button", { name: "Reopen as draft" }).click();
    await expect(page.locator("#invoice-status-actions").getByRole("alert")).toContainText(
      "The billed time no longer exists, so this invoice cannot be reopened.",
    );
    await expect(page.getByText("This invoice is void.")).toBeVisible();
    await expect(page.locator("#invoice-reopen-reason")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
    await shot(page, shots, "invoice-reopen-deleted");
  } finally {
    await ownerContext.close();
    await prisma.$disconnect();
  }
});
