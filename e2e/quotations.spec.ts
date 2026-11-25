import "./env";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
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

test("an owner quotes, expires, shares, duplicates, and converts while a member is blocked", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "mia-quote@ulix.test",
      name: "Mia Quote",
      role: "member",
      passwordHash: "unused",
    },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD", quotationPrefix: "Q", nextQuotationNumber: 1 },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: {
      name: "Quotation Northwind",
      currency: "USD",
      address: "1 Harbor Street",
      billingAddress: "1 Harbor Street",
      emails: { create: [{ email: "billing@northwind.test", position: 0 }] },
    },
  });

  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/timesheets");
    await expect(memberPage.getByRole("link", { name: "Quotations" })).toHaveCount(0);
    await expect(memberPage.getByRole("link", { name: "Invoices" })).toHaveCount(0);
    const denied = await memberPage.goto("/quotations");
    expect(denied?.status()).toBe(200);
    await expect(memberPage.getByText("Only owners and admins can manage quotations.")).toBeVisible();
    const forbidden = await memberPage.request.get("/quotations/missing/pdf");
    expect(forbidden.status()).toBe(403);
    const csvDenied = await memberPage.request.get("/quotations/export");
    expect(csvDenied.status()).toBe(403);

    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto("/quotations/new");
    await waitForHydration(page);
    const nav = page.locator("nav[aria-label='Primary']").first();
    const navText = await nav.innerText();
    expect(navText.indexOf("Quotations")).toBeGreaterThan(navText.indexOf("Invoices"));
    await page.locator("#quotation-client").selectOption(client.id);
    await page.getByRole("button", { name: "Create quotation" }).click();
    await expect(page.getByRole("heading", { name: "Quotation Q-0001" })).toBeVisible();

    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Type 1").selectOption("hours");
    await page.getByLabel("Description 1").fill("Weekly quotation");
    await page.getByLabel("Total hours (qty) 1").fill("2");
    await page.getByLabel("Unit price 1").fill("25");
    await page.locator("#quotation-tax-enabled").check();
    await page.locator("#quotation-tax-rate").fill("10");
    await page.locator("#quotation-issue-date").fill("2020-01-02");
    await page.locator("#quotation-valid-until").fill("2020-01-02");
    await expect(page.locator("#quotation-totals")).toContainText("USD 50.00");
    await expect(page.locator("#quotation-totals")).toContainText("USD 5.00");
    await expect(page.locator("#quotation-totals")).toContainText("USD 55.00");
    await shot(page, shots, "quotation-form");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(page.locator("#quotation-status")).toHaveText("Expired");

    const quotationUrl = new URL(page.url());
    const pdf = await page.request.get(`${quotationUrl.pathname}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(pdf.headers()["content-disposition"]).toContain("Quotation-Q-0001");
    const body = await pdf.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto("/quotations");
    const row = page.getByRole("row", { name: /Quotation Northwind/ });
    await expect(row.getByRole("link", { name: "Q-0001" })).toBeVisible();
    await expect(row.getByRole("cell", { name: "Expired" })).toBeVisible();
    await shot(page, shots, "quotations-list");

    const csv = await page.request.get("/quotations/export");
    expect(csv.status()).toBe(200);
    const csvText = await csv.text();
    expect(csvText).toContain("Q-0001");
    expect(csvText).toContain("Quotation Northwind");
    expect(csvText).toContain("Expired");
    expect(csvText).toContain("50.00");
    expect(csvText).toContain("5.00");
    expect(csvText).toContain("55.00");
    expect(csvText).not.toContain("Account Number");

    await page.goto(quotationUrl.pathname);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Mark as sent" }).click();
    await expect(page.getByText("Quotation marked as sent.")).toBeVisible();
    await expect(page.locator("#quotation-status")).toHaveText("Expired");

    await page.getByRole("button", { name: "Create client link" }).click();
    await expect(page.locator("#quotation-client-url")).toBeVisible();
    const sharePath = new URL(await page.locator("#quotation-client-url").inputValue()).pathname;
    expect(sharePath.startsWith("/q/")).toBe(true);
    const publicPage = await ownerContext.newPage();
    await publicPage.goto(sharePath);
    await expect(publicPage.getByRole("heading", { name: "Quotation Q-0001" })).toBeVisible();
    await expect(publicPage.getByText("USD 55.00")).toBeVisible();
    await expect(publicPage.getByText("Amount due")).toHaveCount(0);
    await expect(publicPage.getByText("Account Number")).toHaveCount(0);
    await expect(publicPage.getByText("Paid")).toHaveCount(0);
    const publicPdf = await publicPage.request.get(`${sharePath}/pdf`);
    expect(publicPdf.status()).toBe(200);
    expect((await publicPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await publicPage.close();

    await page.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByRole("heading", { name: "Quotation Q-0002" })).toBeVisible();
    await expect(page.locator("#quotation-status")).toHaveText("Draft");
    await expect(page.getByText("Quotation duplicated as a new draft.")).toBeVisible();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly quotation");

    await page.goto(quotationUrl.pathname);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Mark accepted" }).click();
    await expect(page.getByText("Quotation marked as accepted.")).toBeVisible();
    await expect(page.locator("#quotation-status")).toHaveText("Accepted");
    await page.getByRole("button", { name: "Convert to invoice" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice / })).toBeVisible();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly quotation");
    await expect(page.getByText("USD 50.00").first()).toBeVisible();
    await expect(page.locator("#invoice-tax-enabled")).toBeChecked();
    await expect(page.locator("#invoice-draft-tax-rate")).toHaveValue("10");
    await expect(page.getByRole("link", { name: "Q-0001" })).toBeVisible();
    const invoiceNumber = await page.getByRole("heading", { level: 1 }).innerText();
    expect(invoiceNumber.startsWith("Invoice Q-")).toBe(false);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await prisma.$disconnect();
  }
});
