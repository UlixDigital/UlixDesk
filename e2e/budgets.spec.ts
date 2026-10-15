import "./env";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { saveBudget } from "../src/lib/budgets";
import { deleteTimeChangesForTests } from "../src/lib/reset-test-db";
import { createManualEntry } from "../src/lib/time-entries";
import { todayInTimeZone, zonedDayStart } from "../src/lib/time-zone";
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

async function shotLocator(page: Page, dir: string, selector: string, name: string) {
  await mkdir(dir, { recursive: true });
  await page.locator(selector).screenshot({ path: path.join(dir, `${name}.png`) });
}

test("an owner sets a budget, sees the warning, and cannot start past a hard stop", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "mia-budget@ulix.test",
      name: "Mia Budget",
      role: "member",
      passwordHash: "unused",
    },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const acme = await prisma.client.create({ data: { name: "Acme Budget", currency: "USD" } });
  const website = await prisma.project.create({
    data: { name: "Budget Website", clientId: acme.id, billable: true },
  });
  const shots = artifactDir(testInfo);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    await page.goto(`/projects/${website.id}/edit`);
    await waitForHydration(page);
    await page.locator("#budget-amount").fill("1");
    await page.locator("#budget-alert").fill("80");
    await page.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Budget saved." })).toBeVisible();
    await shotLocator(page, shots, "#budget-settings", "budget-settings");

    const today = todayInTimeZone("Asia/Colombo");
    const start = zonedDayStart(today, "Asia/Colombo");
    await createManualEntry(
      {
        projectId: website.id,
        startedAt: new Date(start.getTime() + 60 * 60 * 1000),
        endedAt: new Date(start.getTime() + 110 * 60 * 1000),
        billable: true,
        note: "Fifty minutes",
      },
      new Date(start.getTime() + 3 * 60 * 60 * 1000),
      member.id,
    );
    await page.reload();
    await expect(page.locator("#budget-progress")).toHaveAttribute("data-budget-warning", "true");
    await expect(page.getByRole("alert").filter({ hasText: "This budget has used 83.3% (alert at 80%)." })).toBeVisible();
    await shotLocator(page, shots, "#budget-progress", "budget-progress-warning");

    await page.locator("#budget-amount").fill("0.50");
    await page.locator("#budget-hard-stop").check();
    await page.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Budget saved." })).toBeVisible();

    await page.goto("/timesheets");
    await waitForHydration(page);
    await page.locator("#timer-project").selectOption(website.id);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "reached its budget" })).toBeVisible();
    await shot(page, shots, "budget-timer-blocked");

    expect(
      (
        await saveBudget({
          actorRole: owner.role,
          actorId: owner.id,
          scope: "client",
          clientId: acme.id,
          form: {
            basis: "cost",
            amount: "100",
            recurrence: "total",
            startsOn: "",
            billableOnly: true,
            alertPercent: "",
            hardStop: false,
          },
        })
      ).ok,
    ).toBe(true);

    await page.goto("/reports/budgets");
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Budget Website/ })).toContainText("Reached");
    await expect(page.getByRole("row", { name: /Acme Budget/ })).toContainText("No rate");
    await expect(page.getByRole("row", { name: /Acme Budget/ })).toContainText("—");
    await shot(page, shots, "budgets-report");

    const pdf = await page.request.get("/reports/budgets/export?format=pdf");
    expect(pdf.ok()).toBeTruthy();
    await rasterPdf(Buffer.from(await pdf.body()), shots, "budgets-pdf", 1);

    await signIn(memberContext, prisma, member.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/reports/budgets");
    await expect(memberPage.getByRole("rowheader", { name: "Budget Website" })).toBeVisible();
    await expect(memberPage.getByRole("rowheader", { name: "Acme Budget" })).toHaveCount(0);
    const memberText = await memberPage.locator("main").innerText();
    expect(memberText).not.toMatch(/USD|\$|€|£/);
    const memberCsv = await memberPage.request.get("/reports/budgets/export");
    expect(memberCsv.ok()).toBeTruthy();
    const csv = await memberCsv.text();
    expect(csv).toContain("Budget Website");
    expect(csv).not.toMatch(/\bUSD\b|\$/);
    await memberPage.goto(`/projects/${website.id}/edit`);
    await expect(memberPage.locator("#budget-progress")).toBeVisible();
    await expect(memberPage.locator("#budget-settings")).toHaveCount(0);
    expect(await memberPage.locator("body").innerText()).not.toMatch(/USD|\$/);

    await paintContinuedActivity(prisma, owner.id, acme.id, start);
    const activity = await page.request.get("/reports/time-activity/export?format=pdf");
    expect(activity.ok()).toBeTruthy();
    await rasterContinued(Buffer.from(await activity.body()), shots);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await deleteTimeChangesForTests(prisma);
    await prisma.timeEntry.deleteMany({ where: { project: { clientId: acme.id } } });
    await prisma.project.deleteMany({ where: { clientId: acme.id } });
    await prisma.client.delete({ where: { id: acme.id } });
    await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.user.delete({ where: { id: member.id } });
    await prisma.$disconnect();
  }
});

test("a member sees hours alerts only for projects they track, and cannot move time onto a capped project", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const member = await prisma.user.create({
    data: {
      email: "mem2-budget@ulix.test",
      name: "Mem Two",
      role: "member",
      passwordHash: "unused",
    },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "Asia/Colombo", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "Asia/Colombo", defaultCurrency: "USD" },
  });
  const client = await prisma.client.create({ data: { name: "Mem Budget Client", currency: "USD" } });
  const tracked = await prisma.project.create({
    data: { name: "Mem Tracked Hours", clientId: client.id, billable: true },
  });
  const other = await prisma.project.create({
    data: { name: "Mem Other Hours", clientId: client.id, billable: true },
  });
  const cost = await prisma.project.create({
    data: { name: "Mem Cost", clientId: client.id, billable: true },
  });
  const open = await prisma.project.create({
    data: { name: "Mem Open", clientId: client.id, billable: true },
  });
  const capped = await prisma.project.create({
    data: { name: "Mem Capped", clientId: client.id, billable: true },
  });
  const hoursForm = {
    basis: "hours" as const,
    amount: "1",
    recurrence: "total" as const,
    startsOn: "",
    billableOnly: true,
    alertPercent: "80",
    hardStop: false,
  };
  const context = await browser.newContext();
  const today = todayInTimeZone("Asia/Colombo");
  const start = zonedDayStart(today, "Asia/Colombo");
  const now = new Date(start.getTime() + 15 * 60 * 60 * 1000);
  let moveId = "";
  try {
    for (const projectId of [tracked.id, other.id]) {
      expect(
        (
          await saveBudget({
            actorRole: owner.role,
            actorId: owner.id,
            scope: "project",
            projectId,
            form: hoursForm,
          })
        ).ok,
      ).toBe(true);
    }
    await prisma.billRate.create({
      data: {
        scope: "client",
        clientId: client.id,
        amountMinor: 10_000,
        currency: "USD",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.id,
      },
    });
    expect(
      (
        await saveBudget({
          actorRole: owner.role,
          actorId: owner.id,
          scope: "project",
          projectId: cost.id,
          form: {
            basis: "cost",
            amount: "100",
            recurrence: "total",
            startsOn: "",
            billableOnly: true,
            alertPercent: "80",
            hardStop: false,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await saveBudget({
          actorRole: owner.role,
          actorId: owner.id,
          scope: "project",
          projectId: capped.id,
          form: { ...hoursForm, billableOnly: true, alertPercent: "", hardStop: true },
        })
      ).ok,
    ).toBe(true);

    await createManualEntry(
      {
        projectId: tracked.id,
        startedAt: new Date(start.getTime() + 9 * 60 * 60 * 1000),
        endedAt: new Date(start.getTime() + 9 * 60 * 60 * 1000 + 50 * 60 * 1000),
        billable: true,
        note: "Tracked hours",
      },
      now,
      member.id,
    );
    await createManualEntry(
      {
        projectId: other.id,
        startedAt: new Date(start.getTime() + 10 * 60 * 60 * 1000),
        endedAt: new Date(start.getTime() + 10 * 60 * 60 * 1000 + 50 * 60 * 1000),
        billable: true,
        note: "Owner hours",
      },
      now,
      owner.id,
    );
    await createManualEntry(
      {
        projectId: cost.id,
        startedAt: new Date(start.getTime() + 11 * 60 * 60 * 1000),
        endedAt: new Date(start.getTime() + 11 * 60 * 60 * 1000 + 54 * 60 * 1000),
        billable: true,
        note: "Cost time",
      },
      now,
      member.id,
    );
    await createManualEntry(
      {
        projectId: capped.id,
        startedAt: new Date(start.getTime() + 7 * 60 * 60 * 1000),
        endedAt: new Date(start.getTime() + 7 * 60 * 60 * 1000 + 70 * 60 * 1000),
        billable: true,
        note: "Filled",
      },
      now,
      owner.id,
    );
    const move = await createManualEntry(
      {
        projectId: open.id,
        startedAt: new Date(start.getTime() + 12 * 60 * 60 * 1000),
        endedAt: new Date(start.getTime() + 12 * 60 * 60 * 1000 + 15 * 60 * 1000),
        billable: false,
        note: "Move me",
      },
      now,
      member.id,
    );
    moveId = move.entry.id;

    await signIn(context, prisma, member.email);
    const page = await context.newPage();

    await page.goto(`/timesheets?notice=budget&alertProject=${cost.id}`);
    await expect(page.getByText("This budget has used")).toHaveCount(0);
    await expect(page.getByText(/alert at/)).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(/\d+(\.\d+)?%/);

    await page.goto(`/timesheets?notice=budget&alertProject=${other.id}`);
    await expect(page.getByText("This budget has used")).toHaveCount(0);
    await expect(page.getByText(/alert at/)).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(/\d+(\.\d+)?%/);

    await page.goto(`/timesheets?notice=budget&alertProject=${tracked.id}`);
    await expect(
      page.getByRole("status").filter({ hasText: "This budget has used 83.3% (alert at 80%)." }),
    ).toBeVisible();

    await page.goto("/timesheets");
    await waitForHydration(page);
    await page.locator("#timer-project").selectOption(tracked.id);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "This budget has used 83.3% (alert at 80%)." }),
    ).toBeVisible();

    await page.goto(`/timesheets/${moveId}/edit`);
    await waitForHydration(page);
    await page.locator("#entry-project").selectOption(capped.id);
    await expect(page.locator("#entry-billable")).not.toBeChecked();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "reached its budget" })).toBeVisible();
    const stayed = await prisma.timeEntry.findUniqueOrThrow({ where: { id: moveId } });
    expect(stayed.projectId).toBe(open.id);
    expect(stayed.billable).toBe(false);
  } finally {
    await context.close();
    await deleteTimeChangesForTests(prisma);
    await prisma.runningTimer.deleteMany({ where: { id: member.id } });
    await prisma.timeEntry.deleteMany({ where: { project: { clientId: client.id } } });
    await prisma.billRate.deleteMany({ where: { clientId: client.id } });
    await prisma.budget.deleteMany({
      where: { projectId: { in: [tracked.id, other.id, cost.id, capped.id] } },
    });
    await prisma.project.deleteMany({ where: { clientId: client.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.user.delete({ where: { id: member.id } });
    await prisma.$disconnect();
  }
});

async function paintContinuedActivity(
  prisma: PrismaClient,
  userId: string,
  clientId: string,
  start: Date,
) {
  for (let index = 0; index < 24; index += 1) {
    const project = await prisma.project.create({
      data: { name: `Split task ${String(index + 1).padStart(2, "0")}`, clientId, billable: true },
    });
    const began = new Date(start.getTime() + (4 + index) * 60 * 1000);
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: began,
        endedAt: new Date(began.getTime() + 60 * 1000),
        billable: true,
        note: `Continued row note ${index} ${"detail ".repeat(12)}`,
      },
      new Date(start.getTime() + 6 * 60 * 60 * 1000),
      userId,
    );
  }
}

async function rasterPdf(pdf: Buffer, dir: string, name: string, pageNumber: number) {
  await mkdir(dir, { recursive: true });
  const pdfPath = path.join(dir, `${name}.pdf`);
  await writeFile(pdfPath, pdf);
  execFileSync("pdftoppm", [
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-png",
    "-singlefile",
    "-r",
    "110",
    pdfPath,
    path.join(dir, name),
  ]);
}

async function rasterContinued(pdf: Buffer, dir: string) {
  await mkdir(dir, { recursive: true });
  const name = "time-activity-continued";
  const pdfPath = path.join(dir, `${name}.pdf`);
  await writeFile(pdfPath, pdf);
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const count = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? "1");
  let chosen = 1;
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const text = execFileSync("pdftotext", ["-f", String(pageNumber), "-l", String(pageNumber), "-layout", pdfPath, "-"], {
      encoding: "utf8",
    });
    // The date cell is "Thu, Oct 15, 2026 (continued)" and wraps, so the
    // marker sits on the next line. The client heading's "(continued)" does not.
    if (
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}[^\n]{0,180}\n\s*\(continued\)/.test(
        text,
      )
    ) {
      chosen = pageNumber;
      break;
    }
  }
  expect(chosen).toBeGreaterThan(1);
  await rasterPdf(pdf, dir, name, chosen);
}
