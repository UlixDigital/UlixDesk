import "./env";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createManualEntry } from "../src/lib/time-entries";
import { zonedDayStart } from "../src/lib/time-zone";
import { signIn } from "./auth";

function artifactDir(testInfo: TestInfo) {
  return process.env.ULIXDESK_E2E_ARTIFACTS ?? testInfo.outputDir;
}

async function shot(page: Page, dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    if (!form) return false;
    return Object.getOwnPropertyNames(form).some((key) => key.startsWith("__react"));
  });
}

test("an owner creates a blank invoice, issues it, downloads the PDF, and records a payment", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: { email: "noa-manual@ulix.test", name: "Noa Manual", role: "member", passwordHash: "unused" },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD", nextInvoiceNumber: 2100 },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: {
      name: "Manual Invoice Co",
      currency: "USD",
      address: "12 Lake Road, Colombo",
      billingAddress: "12 Lake Road, Colombo",
    },
  });
  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto("/invoices/new?blank=1");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible();
    await page.locator("#blank-invoice-client").selectOption(client.id);
    await shot(page, shots, "manual-invoice-form");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice LE2100/ })).toBeVisible();

    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Description 1").fill("Design review");
    await page.getByLabel("Range start 1").fill("2026-10-01");
    await page.getByLabel("Range end 1").fill("2026-10-03");
    await page.getByLabel("Total hours (qty) 1").fill("1.5");
    await page.getByLabel("Unit price 1").fill("40");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Description 2").fill("Support");
    await page.getByLabel("Total hours (qty) 2").fill("2:00:00");
    await page.getByLabel("Unit price 2").fill("25");
    await page.getByRole("button", { name: "Move up 2" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Support");
    await expect(page.getByLabel("Description 2")).toHaveValue("Design review");
    await page.locator("#invoice-notes").fill("Manual invoice for design.");
    await shot(page, shots, "manual-invoice-lines");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(page.getByLabel("Description 1")).toHaveValue("Support");

    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();
    await expect(page.getByText("Support").first()).toBeVisible();
    await expect(page.getByText("Thu, Oct 1, 2026 - Sat, Oct 3, 2026")).toBeVisible();
    await expect(page.getByText("1:30:00")).toBeVisible();
    await expect(page.getByText("2:00:00")).toBeVisible();

    const invoiceUrl = new URL(page.url());
    const pdf = await page.request.get(`${invoiceUrl.pathname}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const body = await pdf.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    await mkdir(shots, { recursive: true });
    const pdfPath = path.join(shots, "manual-invoice.pdf");
    await writeFile(pdfPath, body);
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
    expect(text).toContain("Design review");
    expect(text).toContain("Thu, Oct 1, 2026 - Sat, Oct 3, 2026");
    expect(text).toContain("1:30:00");
    expect(text).toContain("2:00:00");
    expect(text).toContain("$110.00");
    execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", "120", pdfPath, path.join(shots, "manual-invoice-pdf")]);

    await page.locator("#payment-amount").fill("110.00");
    await page.locator("#payment-method").selectOption("bank_transfer");
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.locator("#invoice-status")).toHaveText("Paid");
    await expect(page.locator("#invoice-due")).toHaveText("USD 0.00");

    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    const denied = await memberPage.goto("/invoices/new?blank=1");
    expect(denied?.status()).toBe(200);
    await expect(memberPage.getByText("Only owners and admins can manage invoices.")).toBeVisible();
    await expect(memberPage.getByLabel("Client")).toHaveCount(0);
    const forbidden = await memberPage.request.get(pdf.url());
    expect(forbidden.status()).toBe(403);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await prisma.$disconnect();
  }
});

test("an owner adds a manual line to a time draft and reorders it", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Mixed Invoice Co", currency: "USD", billingAddress: "9 Park Street" },
  });
  const project = await prisma.project.create({
    data: { name: "Weekly site", clientId: client.id, billable: true },
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
  const startedAt = new Date(zonedDayStart("2026-10-06", "Asia/Colombo").getTime() + 60 * 60 * 1000);
  await createManualEntry(
    { projectId: project.id, startedAt, endedAt: new Date(startedAt.getTime() + 3600 * 1000), billable: true, note: null },
    new Date("2026-10-15T12:00:00.000Z"),
    owner.id,
  );

  const shots = artifactDir(testInfo);
  const context = await browser.newContext();
  try {
    await signIn(context, prisma, owner.email);
    const page = await context.newPage();
    await page.goto("/invoices/new");
    await waitForHydration(page);
    await page.locator("#invoice-client").selectOption(client.id);
    await page.locator("#invoice-period-start").fill("2026-10-05");
    await page.locator("#invoice-period-end").fill("2026-10-11");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly Invoice");

    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Description 2").fill("Rush fee");
    await page.getByLabel("Range start 2").fill("2026-10-06");
    await page.getByLabel("Range end 2").fill("2026-10-06");
    await page.getByLabel("Total hours (qty) 2").fill("1:00:00");
    await page.getByLabel("Unit price 2").fill("50");
    await page.getByRole("button", { name: "Move up 2" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Rush fee");
    await expect(page.getByLabel("Description 2")).toHaveValue("Weekly Invoice");
    await shot(page, shots, "mixed-invoice");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(page.getByLabel("Description 1")).toHaveValue("Rush fee");
    await expect(page.getByLabel("Description 2")).toHaveValue("Weekly Invoice");

    await page.getByRole("button", { name: "Refresh from time" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly Invoice");
    await expect(page.getByLabel("Description 2")).toHaveValue("Rush fee");
    await expect(page.getByLabel("Total hours (qty) 2")).toHaveValue("1:00:00");
    await expect(page.getByLabel("Range start 2")).toHaveValue("2026-10-06");
  } finally {
    await context.close();
    await prisma.$disconnect();
  }
});
