import "./env";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createManualEntry } from "../src/lib/time-entries";
import { timeCopy } from "../src/lib/time-copy";
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
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

test("an owner drafts, edits, issues, and downloads an invoice", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "mia-invoice@ulix.test",
      name: "Mia Invoice",
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
      name: "WSI Web Enhancers",
      currency: "USD",
      address: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
      billingAddress: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
    },
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
  const half = 13 * 3600 + 11 * 60 + 6;
  const entries = [];
  for (const day of ["2026-10-05", "2026-10-06"]) {
    const startedAt = new Date(zonedDayStart(day, "Asia/Colombo").getTime() + 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + half * 1000);
    const created = await createManualEntry(
      { projectId: project.id, startedAt, endedAt, billable: true, note: null },
      new Date("2026-10-15T12:00:00.000Z"),
      member.id,
    );
    entries.push(created.entry.id);
  }

  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto("/invoices/settings");
    await waitForHydration(page);
    await expect(page.locator("#invoice-company-name")).toHaveValue("Ulix Digital");
    await expect(page.locator("#invoice-prefix")).toHaveValue("LE");
    await expect(page.locator("#invoice-next-number")).toHaveValue("1176");
    await expect(page.locator("#invoice-bank-details")).toContainText("[not set]");
    await shot(page, shots, "invoice-settings");

    await page.goto("/invoices/new");
    await waitForHydration(page);
    await page.locator("#invoice-client").selectOption(client.id);
    await page.locator("#invoice-period-start").fill("2026-10-05");
    await page.locator("#invoice-period-end").fill("2026-10-11");
    await page.locator("#invoice-grouping").selectOption("period");
    await shot(page, shots, "invoice-create");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice LE/ })).toBeVisible();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly Invoice");
    await expect(page.getByLabel("Total hours (qty) 1")).toHaveValue("26:22:12");
    await expect(page.getByText("USD 659.25").first()).toBeVisible();

    await page.locator("#invoice-issue-date").fill("2026-10-12");
    await page.locator("#invoice-due-date").fill("2026-10-19");
    await page.locator("#invoice-po").fill("PO-4421");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(page.locator("#invoice-po")).toHaveValue("PO-4421");
    await shot(page, shots, "invoice-draft");

    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();
    await expect(page.getByText("PO-4421")).toBeVisible();
    const invoiceUrl = new URL(page.url());
    const pdf = await page.request.get(`${invoiceUrl.pathname}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const body = await pdf.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.headers()["content-disposition"]).toContain("Invoice-LE");

    await page.goto("/invoices");
    await expect(page.getByRole("link", { name: /^LE\d+/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "WSI Web Enhancers" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Open" })).toBeVisible();
    await shot(page, shots, "invoice-list");

    await page.goto(`/timesheets/${entries[0]}/edit`);
    await waitForHydration(page);
    await page.locator("#entry-note").fill("Should stay locked");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: timeCopy.invoicedTime })).toBeVisible();

    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/timesheets");
    await expect(memberPage.getByRole("link", { name: "Invoices" })).toHaveCount(0);
    const denied = await memberPage.goto("/invoices");
    expect(denied?.status()).toBe(200);
    await expect(memberPage.getByText("Only owners and admins can manage invoices.")).toBeVisible();
    const forbidden = await memberPage.request.get(pdf.url());
    expect(forbidden.status()).toBe(403);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await prisma.$disconnect();
  }
});
