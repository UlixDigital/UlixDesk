import "./env";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { invoiceCopy } from "../src/lib/invoice-copy";
import { invoiceReportCopy } from "../src/lib/invoice-report-copy";
import { addCalendarDays, todayInTimeZone } from "../src/lib/time-zone";
import { signIn } from "./auth";

function dateColumn(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function artifactDir(testInfo: TestInfo) {
  return process.env.ULIXDESK_E2E_ARTIFACTS ?? testInfo.outputDir;
}

async function shot(page: Page, dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("#record-payment form");
    if (!form) return false;
    return Object.getOwnPropertyNames(form).some((key) => key.startsWith("__react"));
  });
}

test("an owner records a partial payment, is refused an overpayment, and opens the invoice reports", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const today = todayInTimeZone("Asia/Colombo");
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({
    data: { name: "Northwind Studio", currency: "USD", billingAddress: "12 Lake Road, Colombo" },
  });
  const euro = await prisma.client.create({
    data: { name: "Euro Atelier", currency: "EUR", billingAddress: "1 Rue Test, Paris" },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: "LE4201",
      clientId: client.id,
      status: "open",
      currency: "USD",
      issueDate: dateColumn(addCalendarDays(today, -40)),
      dueDate: dateColumn(addCalendarDays(today, -10)),
      periodStart: dateColumn(addCalendarDays(today, -47)),
      periodEnd: dateColumn(addCalendarDays(today, -41)),
      grouping: "period",
      notes: "Thank you.",
      bankDetails: "Beneficiary Name: Ulix Digital",
      subtotalMinor: 10000,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 10000,
      paidMinor: 0,
      createdById: owner.id,
      issuedAt: new Date(),
      lines: {
        create: {
          position: 0,
          kind: "custom",
          title: "Design",
          quantitySeconds: 3600,
          unitPriceMinor: 10000,
          amountMinor: 10000,
        },
      },
    },
  });
  await prisma.invoice.create({
    data: {
      number: "LE4202",
      clientId: euro.id,
      status: "open",
      currency: "EUR",
      issueDate: dateColumn(addCalendarDays(today, -20)),
      dueDate: dateColumn(addCalendarDays(today, 5)),
      periodStart: dateColumn(addCalendarDays(today, -27)),
      periodEnd: dateColumn(addCalendarDays(today, -21)),
      grouping: "period",
      notes: "",
      bankDetails: "Beneficiary Name: Ulix Digital",
      subtotalMinor: 8000,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 8000,
      paidMinor: 0,
      createdById: owner.id,
      issuedAt: new Date(),
      lines: {
        create: {
          position: 0,
          kind: "custom",
          title: "Retainer",
          quantitySeconds: 3600,
          unitPriceMinor: 8000,
          amountMinor: 8000,
        },
      },
    },
  });
  await prisma.invoice.create({
    data: {
      number: "LE4203",
      clientId: client.id,
      status: "draft",
      currency: "USD",
      issueDate: dateColumn(today),
      dueDate: dateColumn(addCalendarDays(today, 7)),
      periodStart: dateColumn(today),
      periodEnd: dateColumn(today),
      grouping: "period",
      notes: "",
      bankDetails: "Beneficiary Name: Ulix Digital",
      subtotalMinor: 500,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 500,
      paidMinor: 0,
      createdById: owner.id,
      lines: {
        create: {
          position: 0,
          kind: "custom",
          title: "Draft line",
          quantitySeconds: 60,
          unitPriceMinor: 500,
          amountMinor: 500,
        },
      },
    },
  });
  const member = await prisma.user.create({
    data: { email: "mia-payments@ulix.test", name: "Mia Payments", role: "member", passwordHash: "unused" },
  });

  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  await signIn(ownerContext, prisma, owner.email);
  const page = await ownerContext.newPage();
  await page.goto(`/invoices/${invoice.id}`);
  await expect(page.getByRole("heading", { name: "Invoice LE4201" })).toBeVisible();
  await expect(page.locator("#invoice-overdue")).toHaveText(invoiceCopy.overdue);
  await expect(page.locator("#invoice-paid")).toHaveText("USD 0.00");
  await expect(page.locator("#invoice-due")).toHaveText("USD 100.00");
  await waitForHydration(page);
  await shot(page, shots, "record-payment-form");

  await page.locator("#payment-amount").fill("40.00");
  await page.locator("#payment-date").fill(today);
  await page.locator("#payment-method").selectOption("bank_transfer");
  await page.locator("#payment-note").fill("First wire");
  await page.locator("#record-payment button[type=submit]").click();
  await expect(page.getByText(invoiceCopy.paymentRecorded, { exact: true })).toBeVisible();
  await expect(page.locator("#invoice-status")).toHaveText("Open");
  await expect(page.locator("#invoice-paid")).toHaveText("USD 40.00");
  await expect(page.locator("#invoice-due")).toHaveText("USD 60.00");
  await expect(page.locator("#invoice-overdue")).toBeVisible();
  await expect(page.locator("#invoice-payments")).toContainText("First wire");
  await expect(page.locator("#invoice-payments")).toContainText(owner.name);
  await shot(page, shots, "partial-paid-invoice");

  const pdfResponse = await page.request.get(`/invoices/${invoice.id}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  const pdfBuffer = Buffer.from(await pdfResponse.body());
  const pdfPath = path.join(shots, "invoice-paid-due.pdf");
  await mkdir(shots, { recursive: true });
  await writeFile(pdfPath, pdfBuffer);
  execFileSync("pdftotext", ["-layout", pdfPath, path.join(shots, "invoice-paid-due.txt")]);
  const pdfText = await readFile(path.join(shots, "invoice-paid-due.txt"), "utf8");
  expect(pdfText).toContain("Paid");
  expect(pdfText).toContain("$40.00");
  expect(pdfText).toContain("Amount due");
  expect(pdfText).toContain("$60.00");
  expect(pdfText).toContain("Overdue");
  execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", "120", pdfPath, path.join(shots, "invoice-pdf-paid-due")]);

  await page.locator("#payment-amount").fill("70.00");
  await page.locator("#record-payment button[type=submit]").click();
  await expect(page.locator("#record-payment").getByRole("alert")).toHaveText(invoiceCopy.paymentOverpay);
  await expect(page.locator("#invoice-due")).toHaveText("USD 60.00");
  await shot(page, shots, "refused-overpay");

  await page.locator("#payment-amount").fill("60.00");
  await page.locator("#payment-note").fill("Remainder");
  await page.locator("#record-payment button[type=submit]").click();
  await expect(page.locator("#invoice-status")).toHaveText("Paid");
  await expect(page.locator("#invoice-paid")).toHaveText("USD 100.00");
  await expect(page.locator("#invoice-due")).toHaveText("USD 0.00");
  await expect(page.locator("#invoice-overdue")).toHaveCount(0);
  await shot(page, shots, "paid-invoice");

  const from = addCalendarDays(today, -60);
  const to = today;
  await page.goto(`/reports/client-invoices?preset=custom&from=${from}&to=${to}`);
  await expect(page.getByRole("heading", { name: invoiceReportCopy.clientTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: "LE4201" })).toBeVisible();
  await expect(page.getByRole("link", { name: "LE4202" })).toBeVisible();
  await expect(page.getByText("LE4203")).toHaveCount(0);
  await expect(page.getByText("USD 100.00").first()).toBeVisible();
  await expect(page.getByText("EUR 80.00").first()).toBeVisible();
  await shot(page, shots, "client-invoices-report");

  const csv = await page.request.get(`/reports/client-invoices/export?preset=custom&from=${from}&to=${to}`);
  expect(csv.status()).toBe(200);
  const csvBody = await csv.text();
  expect(csvBody).toContain("LE4201");
  expect(csvBody).not.toContain("LE4203");
  await writeFile(path.join(shots, "client-invoices.csv"), csvBody);
  const reportPdf = await page.request.get(`/reports/client-invoices/export?preset=custom&from=${from}&to=${to}&format=pdf`);
  expect(reportPdf.status()).toBe(200);
  await writeFile(path.join(shots, "client-invoices.pdf"), Buffer.from(await reportPdf.body()));

  await page.goto(`/reports/invoice-aging?preset=custom&from=${from}&to=${to}`);
  await expect(page.getByRole("heading", { name: invoiceReportCopy.agingTitle })).toBeVisible();
  await expect(page.locator("#invoice-aging-report tbody")).toContainText("Euro Atelier");
  await expect(page.locator("#invoice-aging-report tbody")).not.toContainText("Northwind Studio");
  await expect(page.getByRole("columnheader", { name: "1-30" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "90+" })).toBeVisible();
  await shot(page, shots, "aging-report");
  const agingCsv = await page.request.get(`/reports/invoice-aging/export?preset=custom&from=${from}&to=${to}`);
  expect(agingCsv.status()).toBe(200);
  const agingCsvBody = await agingCsv.text();
  expect(agingCsvBody).toContain("Euro Atelier");
  expect(agingCsvBody).not.toContain("Northwind Studio");
  expect(agingCsvBody).not.toContain("LE4203");
  await writeFile(path.join(shots, "invoice-aging.csv"), agingCsvBody);
  const agingPdf = await page.request.get(`/reports/invoice-aging/export?preset=custom&from=${from}&to=${to}&format=pdf`);
  expect(agingPdf.status()).toBe(200);
  const agingPdfPath = path.join(shots, "invoice-aging.pdf");
  await writeFile(agingPdfPath, Buffer.from(await agingPdf.body()));
  execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", "120", agingPdfPath, path.join(shots, "aging-report-pdf")]);
  execFileSync("pdftoppm", [
    "-png",
    "-f",
    "1",
    "-l",
    "1",
    "-r",
    "120",
    path.join(shots, "client-invoices.pdf"),
    path.join(shots, "client-invoices-pdf"),
  ]);

  const memberContext = await browser.newContext();
  await signIn(memberContext, prisma, member.email);
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/reports/client-invoices`);
  await expect(memberPage.getByRole("heading", { name: invoiceReportCopy.denied })).toBeVisible();
  await expect(memberPage.getByText("USD")).toHaveCount(0);
  const denied = await memberPage.request.get("/reports/client-invoices/export");
  expect(denied.status()).toBe(403);
  const deniedAging = await memberPage.request.get("/reports/invoice-aging/export?format=pdf");
  expect(deniedAging.status()).toBe(403);
  await memberPage.goto(`/invoices/${invoice.id}`);
  await expect(memberPage.getByRole("heading", { name: invoiceCopy.denied })).toBeVisible();
  await expect(memberPage.getByText("USD 100.00")).toHaveCount(0);

  await ownerContext.close();
  await memberContext.close();
  await prisma.$disconnect();
});
