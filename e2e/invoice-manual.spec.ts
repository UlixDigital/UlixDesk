import "./env";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createManualEntry } from "../src/lib/time-entries";
import { addCalendarDays, startOfWeekDate, todayInTimeZone, zonedDayStart } from "../src/lib/time-zone";
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
    await expect(page.getByRole("heading", { name: "Blank invoice" })).toBeVisible();
    await page.locator("#blank-invoice-client").selectOption(client.id);
    await shot(page, shots, "manual-invoice-form");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice LE2100/ })).toBeVisible();

    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Type 1").selectOption("hours");
    await page.getByLabel("Description 1").fill("Design review");
    await page.locator("[data-line-kind='custom']").first().locator("summary").click();
    await page.getByLabel("Range start 1").fill("2026-10-01");
    await page.getByLabel("Range end 1").fill("2026-10-03");
    await page.getByLabel("Total hours (qty) 1").fill("1.5");
    await page.getByLabel("Unit price 1").fill("40");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Type 2").selectOption("hours");
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
    expect(text).toContain("Total hours");
    expect(text).toContain("(qty)");
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
  const member = await prisma.user.create({
    data: { email: "mixed-manual@ulix.test", name: "Mixed Manual", role: "member", passwordHash: "unused" },
  });
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
    member.id,
  );

  const shots = artifactDir(testInfo);
  const context = await browser.newContext();
  try {
    await signIn(context, prisma, owner.email);
    const page = await context.newPage();
    await page.goto("/invoices/new?time=1");
    await waitForHydration(page);
    await page.locator("#invoice-client").selectOption(client.id);
    await page.locator("#invoice-period-start").fill("2026-10-05");
    await page.locator("#invoice-period-end").fill("2026-10-11");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly site");

    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Type 2").selectOption("hours");
    await page.getByLabel("Description 2").fill("Rush fee");
    await page.locator("[data-line-kind='custom']").locator("summary").click();
    await page.getByLabel("Range start 2").fill("2026-10-06");
    await page.getByLabel("Range end 2").fill("2026-10-06");
    await page.getByLabel("Total hours (qty) 2").fill("1:00:00");
    await page.getByLabel("Unit price 2").fill("50");
    await page.getByRole("button", { name: "Move up 2" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Rush fee");
    await expect(page.getByLabel("Description 2")).toHaveValue("Weekly site");
    await shot(page, shots, "mixed-invoice");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(page.getByLabel("Description 1")).toHaveValue("Rush fee");
    await expect(page.getByLabel("Description 2")).toHaveValue("Weekly site");

    await page.getByRole("button", { name: "Refresh from time" }).click();
    await expect(page.getByLabel("Description 1")).toHaveValue("Weekly site");
    await expect(page.getByLabel("Description 2")).toHaveValue("Rush fee");
    await expect(page.getByLabel("Total hours (qty) 2")).toHaveValue("1:00:00");
    await expect(page.getByLabel("Range start 2")).toHaveValue("2026-10-06");
  } finally {
    await context.close();
    await prisma.$disconnect();
  }
});

test("a time line quantity is read-only, and the server rejects a change", async ({ browser }) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: { email: "locked-qty@ulix.test", name: "Locked Quantity", role: "member", passwordHash: "unused" },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Locked Quantity Co", currency: "USD", billingAddress: "1 Lock Street" },
  });
  const project = await prisma.project.create({
    data: { name: "Locked site", clientId: client.id, billable: true },
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
    member.id,
  );
  const context = await browser.newContext();
  try {
    await signIn(context, prisma, owner.email);
    const page = await context.newPage();
    await page.goto("/invoices/new?time=1");
    await waitForHydration(page);
    await page.locator("#invoice-client").selectOption(client.id);
    await page.locator("#invoice-period-start").fill("2026-10-05");
    await page.locator("#invoice-period-end").fill("2026-10-11");
    await page.getByRole("button", { name: "Create draft" }).click();
    const quantity = page.getByLabel("Total hours (qty) 1");
    await expect(quantity).toHaveValue("1:00:00");
    await expect(quantity).toHaveAttribute("readonly", "");
    await expect(page.getByText("Edit the time entries, then Refresh from time")).toBeVisible();

    await page.getByLabel("Description 1").fill("Adjusted week");
    await page.getByLabel("Unit price 1").fill("40");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel("Description 1")).toHaveValue("Adjusted week");
    await expect(page.getByLabel("Unit price 1")).toHaveValue("40.00");
    await expect(page.getByLabel("Total hours (qty) 1")).toHaveValue("1:00:00");

    await page.getByLabel("Total hours (qty) 1").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.readOnly = false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "9:00:00");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator("#invoice-draft").getByRole("alert")).toContainText(
      "Edit the time entries, then Refresh from time",
    );
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel("Description 1")).toHaveValue("Adjusted week");
    await expect(page.getByLabel("Unit price 1")).toHaveValue("40.00");
    await expect(page.getByLabel("Total hours (qty) 1")).toHaveValue("1:00:00");
  } finally {
    await context.close();
    await prisma.$disconnect();
  }
});

test("a zero-total invoice is paid when issued, and it can be reopened", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD", nextInvoiceNumber: 2200 },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Zero Paid Co", currency: "USD", billingAddress: "2 Zero Lane" },
  });
  const context = await browser.newContext();
  const publicContext = await browser.newContext();
  try {
    await signIn(context, prisma, owner.email);
    const page = await context.newPage();
    await page.goto("/invoices/new?blank=1");
    await waitForHydration(page);
    await page.locator("#blank-invoice-client").selectOption(client.id);
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice LE2200/ })).toBeVisible();
    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.locator("#invoice-draft").getByRole("alert")).toContainText(
      "Add at least one line before issuing this invoice.",
    );
    await expect(page.locator("#invoice-status")).toHaveText("Draft");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Description 1").fill("Courtesy");
    await page.getByLabel("Qty 1").fill("1");
    await page.getByLabel("Unit price 1").fill("0");
    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.locator("#invoice-status")).toHaveText("Paid");
    await expect(page.getByText("This invoice is paid because the total is zero.")).toBeVisible();
    await expect(page.locator("#invoice-status-history")).toContainText("Auto-paid because the total is zero");
    await expect(page.locator("#invoice-due")).toHaveText("USD 0.00");

    const invoiceUrl = new URL(page.url());
    const pdf = await page.request.get(`${invoiceUrl.pathname}/pdf`);
    expect(pdf.status()).toBe(200);
    const pdfPath = path.join(artifactDir(testInfo), "zero-paid-invoice.pdf");
    await mkdir(artifactDir(testInfo), { recursive: true });
    await writeFile(pdfPath, await pdf.body());
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
    expect(text).toContain("Status:");
    expect(text).toContain("Paid");
    expect(text).toContain("$0.00");

    await page.getByRole("button", { name: "Create client link" }).click();
    await expect(page.getByText("A client link is active.")).toBeVisible();
    const clientPath = await page.locator("#invoice-client-link").inputValue();
    const clientPage = await publicContext.newPage();
    const opened = await clientPage.goto(clientPath);
    expect(opened?.status()).toBe(200);
    await expect(clientPage.locator("#public-invoice-status")).toHaveText("Paid");

    await page.goto("/reports/client-invoices?preset=custom&from=2026-01-01&to=2026-12-31&status=paid");
    await expect(page.getByRole("row", { name: /LE2200/ })).toContainText("Paid");
    await page.goto("/reports/invoice-aging?preset=custom&from=2026-01-01&to=2026-12-31");
    await expect(page.locator("#invoice-aging-report table")).not.toContainText("Zero Paid Co");

    await page.goto(invoiceUrl.pathname);
    await page.locator("#invoice-reopen-reason").fill("Add a line");
    await page.getByRole("button", { name: "Reopen as draft" }).click();
    await expect(page.getByText("Invoice reopened as a draft.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
    await expect(page.locator("#invoice-status")).toHaveText("Draft");
  } finally {
    await context.close();
    await publicContext.close();
    await prisma.$disconnect();
  }
});

test("new invoice offers equal choices, a blank draft stays quiet, and an item line prints a plain quantity", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD", nextInvoiceNumber: 2300 },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Item Invoice Co", currency: "USD", billingAddress: "4 Item Road" },
  });
  const quiet = await prisma.project.create({
    data: { name: "Unrated quiet", clientId: client.id, billable: true },
  });
  const today = todayInTimeZone("Asia/Colombo");
  const periodStart = addCalendarDays(startOfWeekDate(today), -7);
  const day = addCalendarDays(periodStart, 2);
  const startedAt = new Date(zonedDayStart(day, "Asia/Colombo").getTime() + 60 * 60 * 1000);
  await createManualEntry(
    { projectId: quiet.id, startedAt, endedAt: new Date(startedAt.getTime() + 3600 * 1000), billable: true, note: null },
    new Date("2026-10-15T12:00:00.000Z"),
    owner.id,
  );

  const shots = artifactDir(testInfo);
  const context = await browser.newContext();
  try {
    await signIn(context, prisma, owner.email);
    const page = await context.newPage();
    await page.goto("/invoices");
    await page.getByRole("link", { name: "New invoice", exact: true }).click();
    await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible();
    const choices = page.locator("#invoice-start-choices a");
    await expect(choices).toHaveCount(2);
    await expect(choices.nth(0)).toHaveText(/Blank invoice/);
    await expect(choices.nth(1)).toHaveText(/From tracked time/);
    await shot(page, shots, "new-invoice-choice");

    await choices.nth(0).click();
    await expect(page.getByRole("heading", { name: "Blank invoice" })).toBeVisible();
    await page.goto("/invoices/new?time=1");
    await expect(page.getByRole("heading", { name: "From tracked time" })).toBeVisible();
    await page.goto("/invoices/new?blank=1");
    await waitForHydration(page);
    await page.locator("#blank-invoice-client").selectOption(client.id);
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice LE2300/ })).toBeVisible();
    await expect(page.getByText("Some time was left off this invoice")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Tracked time" })).toHaveCount(0);
    await expect(page.locator("h1 + p")).not.toContainText("–");
    await expect(page.getByRole("button", { name: "Add tracked time" })).toBeVisible();
    await expect(page.locator("#invoice-status-history")).toHaveCount(0);
    await expect(page.locator("#invoice-email-history")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Status history" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Email history" })).toHaveCount(0);
    await shot(page, shots, "blank-draft");

    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByLabel("Type 1")).toHaveValue("item");
    await expect(page.locator("[data-line-kind='custom'] summary")).toBeVisible();
    await expect(page.getByLabel("Range start 1")).toBeHidden();
    await page.getByLabel("Description 1").fill("Website design");
    await page.getByLabel("Qty 1").fill("1");
    await page.getByLabel("Unit price 1").fill("500");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await page.getByRole("button", { name: "Mark as issued" }).click();
    await expect(page.getByText("This invoice is issued.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible();
    await expect(page.getByText("1:00:00")).toHaveCount(0);

    const order = await page.evaluate(() => {
      const lines = document.querySelector("#invoice-issued-lines");
      const link = document.querySelector("#invoice-client-link-section");
      const history = document.querySelector("#invoice-status-history");
      const voidButton = document.querySelector("#invoice-void");
      if (!lines || !link || !history || !voidButton) return "missing";
      const follows = (earlier: Element, later: Element) =>
        (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const quiet = voidButton.className.includes("ring-rose-200") && !voidButton.className.includes("bg-rose-700");
      return follows(lines, link) && follows(lines, history) && follows(history, voidButton) && quiet ? "ok" : "bad";
    });
    expect(order).toBe("ok");
    await shot(page, shots, "issued-detail");

    const invoiceUrl = new URL(page.url());
    const pdf = await page.request.get(`${invoiceUrl.pathname}/pdf`);
    expect(pdf.status()).toBe(200);
    const pdfPath = path.join(shots, "item-invoice.pdf");
    await mkdir(shots, { recursive: true });
    await writeFile(pdfPath, await pdf.body());
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
    expect(text).toContain("Website design");
    expect(text).toContain("Qty");
    expect(text).not.toContain("Total hours");
    expect(text).toContain("$500.00");
    expect(text).not.toContain("1:00:00");
    expect(text).toMatch(/Website design[\s\S]{0,400}\b1\b/);
    execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", "120", pdfPath, path.join(shots, "item-line-pdf")]);

    await page.getByRole("button", { name: "Create client link" }).click();
    await expect(page.getByText("A client link is active.")).toBeVisible();
    const clientPath = await page.locator("#invoice-client-link").inputValue();
    const clientPage = await context.newPage();
    await clientPage.goto(clientPath);
    await expect(clientPage.getByRole("cell", { name: "1", exact: true })).toBeVisible();
    await expect(clientPage.getByText("1:00:00")).toHaveCount(0);
  } finally {
    await context.close();
    await prisma.$disconnect();
  }
});
