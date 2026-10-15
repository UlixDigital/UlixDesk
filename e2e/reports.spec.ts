import "./env";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { saveClientRate } from "../src/lib/bill-rates";
import { deleteTimeChangesForTests } from "../src/lib/reset-test-db";
import { createManualEntry } from "../src/lib/time-entries";
import { signIn } from "./auth";

async function shot(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.ULIXDESK_E2E_ARTIFACTS ?? testInfo.outputDir;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test("owners see amounts and members see only their own time", async ({ browser }, testInfo) => {
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "mia-reports@ulix.test",
      name: "Mia Member",
      role: "member",
      passwordHash: "unused",
    },
  });
  const acme = await prisma.client.create({ data: { name: "Acme Reports", currency: "USD" } });
  const tokyo = await prisma.client.create({ data: { name: "Tokyo Reports", currency: "JPY" } });
  const website = await prisma.project.create({
    data: { name: "Website Report", clientId: acme.id, billable: true },
  });
  const brochure = await prisma.project.create({
    data: { name: "Brochure Report", clientId: tokyo.id, billable: true },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "UTC", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "UTC", defaultCurrency: "USD" },
  });
  expect((await saveClientRate({
    clientId: acme.id,
    amountRaw: "50",
    effectiveFrom: "2020-01-01",
    createdById: owner.id,
  })).ok).toBe(true);
  expect((await saveClientRate({
    clientId: tokyo.id,
    amountRaw: "1500",
    effectiveFrom: "2020-01-01",
    createdById: owner.id,
  })).ok).toBe(true);
  const now = new Date();
  await createManualEntry(
    {
      projectId: website.id,
      startedAt: new Date("2026-10-14T09:00:00.000Z"),
      endedAt: new Date("2026-10-14T10:00:00.000Z"),
      billable: true,
      note: "Owner only note",
    },
    now,
    owner.id,
  );
  await createManualEntry(
    {
      projectId: brochure.id,
      startedAt: new Date("2026-10-14T11:00:00.000Z"),
      endedAt: new Date("2026-10-14T12:00:00.000Z"),
      billable: true,
      note: "=Mia session",
    },
    now,
    member.id,
  );

  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/reports");
    await expect(ownerPage.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(ownerPage.getByText("Customers")).toHaveCount(0);
    await shot(ownerPage, testInfo, "reports_hub_owner");

    await ownerPage.getByRole("link", { name: "Time & Activity" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Time & Activity" })).toBeVisible();
    await expect(ownerPage.getByRole("form", { name: "Filters" }).getByLabel("Date range")).toBeVisible();
    await expect(ownerPage.getByLabel("Member")).toBeVisible();
    await expect(ownerPage.getByLabel("Client")).toBeVisible();
    await expect(ownerPage.getByText("USD 50.00").first()).toBeVisible();
    await expect(ownerPage.getByText("JPY 1,500").first()).toBeVisible();
    await expect(ownerPage.getByText("Owner only note")).toHaveCount(0);
    await shot(ownerPage, testInfo, "reports_time_activity_owner");

    const csvResponse = await ownerPage.request.get(
      "/reports/time-activity/export?preset=custom&from=2026-10-01&to=2026-10-31&group=member",
    );
    expect(csvResponse.status()).toBe(200);
    expect(csvResponse.headers()["content-type"]).toContain("text/csv");
    const csv = await csvResponse.text();
    expect(csv).toContain("Hours (decimal)");
    expect(csv).toContain("Amount (USD)");
    expect(csv).toContain("Amount (JPY)");
    expect(csv).toContain("Status");
    expect(csv).toContain("50.00");
    expect(csv).toContain("1500");
    expect(csv).toContain("Billable");
    expect(csv).not.toContain("USD 50.00");
    expect(csv).not.toContain("JPY 1,500");
    expect(csv).not.toContain("No amount");

    const pdfResponse = await ownerPage.request.get(
      "/reports/time-activity/export?preset=custom&from=2026-10-01&to=2026-10-31&format=pdf",
    );
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    expect(pdfResponse.headers()["content-disposition"]).toContain("time-activity.pdf");
    const pdf = await pdfResponse.body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    await ownerPage.goto("/reports/daily?preset=custom&from=2026-10-01&to=2026-10-31");
    await expect(ownerPage.getByRole("heading", { name: "Daily totals" })).toBeVisible();
    await expect(ownerPage.getByText("USD 50.00").first()).toBeVisible();
    await shot(ownerPage, testInfo, "reports_daily_owner");

    await ownerPage.goto("/reports/weekly?preset=custom&from=2026-10-01&to=2026-10-31");
    await expect(ownerPage.getByRole("heading", { name: "Weekly totals" })).toBeVisible();
    await expect(ownerPage.getByText("JPY 1,500").first()).toBeVisible();
    await shot(ownerPage, testInfo, "reports_weekly_owner");

    await ownerPage.goto("/reports/work-sessions?preset=custom&from=2026-10-01&to=2026-10-31");
    await expect(ownerPage.getByRole("heading", { name: "Work sessions" })).toBeVisible();
    await expect(ownerPage.getByText("Owner only note")).toBeVisible();
    await expect(ownerPage.getByText("=Mia session")).toBeVisible();
    await shot(ownerPage, testInfo, "reports_sessions_owner");

    await ownerPage.setViewportSize({ width: 485, height: 900 });
    await ownerPage.goto("/timesheets?view=week&date=2026-10-14");
    await expect(ownerPage.getByRole("table")).toBeVisible();
    const overflow = await ownerPage.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/reports");
    await expect(memberPage.getByText("You see your own time.")).toBeVisible();
    await shot(memberPage, testInfo, "reports_hub_member");
    await memberPage.goto(
      `/reports/time-activity?preset=custom&from=2026-10-01&to=2026-10-31&group=member&member=${owner.id}`,
    );
    await expect(memberPage.getByRole("rowheader", { name: "Brochure Report" })).toBeVisible();
    await expect(memberPage.getByRole("option", { name: "Member" })).toHaveCount(0);
    await expect(memberPage.getByText("Owners and admins also see the amount")).toHaveCount(0);
    await expect(memberPage.getByText(owner.name)).toHaveCount(0);
    await expect(memberPage.getByText("Owner only note")).toHaveCount(0);
    await expect(memberPage.getByRole("columnheader", { name: "Amount (JPY)" })).toHaveCount(0);
    await expect(memberPage.getByRole("columnheader", { name: "Amount (USD)" })).toHaveCount(0);
    const html = await memberPage.content();
    expect(html).not.toMatch(/USD|JPY/);
    await shot(memberPage, testInfo, "reports_time_activity_member");

    await memberPage.goto("/reports/daily?preset=custom&from=2026-10-01&to=2026-10-31");
    await shot(memberPage, testInfo, "reports_daily_member");
    await memberPage.goto("/reports/weekly?preset=custom&from=2026-10-01&to=2026-10-31");
    await shot(memberPage, testInfo, "reports_weekly_member");
    await memberPage.goto("/reports/work-sessions?preset=custom&from=2026-10-01&to=2026-10-31");
    await expect(memberPage.getByText("=Mia session")).toBeVisible();
    await expect(memberPage.getByText("Owner only note")).toHaveCount(0);
    await shot(memberPage, testInfo, "reports_sessions_member");

    const memberCsv = await memberPage.request.get(
      "/reports/work-sessions/export?preset=custom&from=2026-10-01&to=2026-10-31&columns=start,end,duration,project,client,notes,billable,amount,member",
    );
    expect(memberCsv.status()).toBe(200);
    const memberBody = await memberCsv.text();
    expect(memberBody).toContain("'=Mia session");
    expect(memberBody).not.toContain("Owner only note");
    expect(memberBody).not.toMatch(/USD|JPY|Amount/);

    const memberPdf = await memberPage.request.get(
      "/reports/time-activity/export?preset=custom&from=2026-10-01&to=2026-10-31&format=pdf&columns=hours,amount",
    );
    expect(memberPdf.status()).toBe(200);
    expect(memberPdf.headers()["content-type"]).toContain("application/pdf");
    expect((await memberPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const editsPdf = await ownerPage.request.get(
      "/reports/manual-time-edits/export?format=pdf&from=2026-10-01&to=2026-10-31",
    );
    expect(editsPdf.status()).toBe(200);
    expect(editsPdf.headers()["content-type"]).toContain("application/pdf");
    expect(editsPdf.headers()["x-error-code"]).toBeUndefined();

    const repeated = await ownerPage.request.get(
      "/reports/manual-time-edits?action=added&action=deleted&page=1&page=2&to=9999-12-31",
    );
    expect(repeated.status()).toBe(200);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await deleteTimeChangesForTests(prisma);
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [website.id, brochure.id] } } });
    await prisma.billRate.deleteMany({ where: { clientId: { in: [acme.id, tokyo.id] } } });
    await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.project.deleteMany({ where: { id: { in: [website.id, brochure.id] } } });
    await prisma.client.deleteMany({ where: { id: { in: [acme.id, tokyo.id] } } });
    await prisma.user.delete({ where: { id: member.id } });
    await prisma.$disconnect();
  }
});
