import "./env";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { saveClientRate } from "../src/lib/bill-rates";
import { createManualEntry } from "../src/lib/time-entries";
import { signIn } from "./auth";
import { markupWithoutScripts } from "./markup";

const execFileAsync = promisify(execFile);
const artifacts = "/opt/cursor/artifacts";

test("time and activity groups two levels and sorts from the header", async ({ browser }) => {
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const zoe = await prisma.user.create({
    data: {
      email: "zoe-groups@ulix.test",
      name: "Zoe Member",
      role: "member",
      passwordHash: "unused",
    },
  });
  const acme = await prisma.client.create({ data: { name: "Acme Groups", currency: "USD" } });
  const website = await prisma.project.create({
    data: { name: "Website Group", clientId: acme.id, billable: true },
  });
  const brochure = await prisma.project.create({
    data: { name: "Brochure Group", clientId: acme.id, billable: true },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "UTC", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "UTC", defaultCurrency: "USD" },
  });
  expect(
    (
      await saveClientRate({
        clientId: acme.id,
        amountRaw: "50",
        effectiveFrom: "2020-01-01",
        createdById: owner.id,
      })
    ).ok,
  ).toBe(true);
  const now = new Date();
  await createManualEntry(
    {
      projectId: website.id,
      startedAt: new Date("2026-03-11T09:00:00.000Z"),
      endedAt: new Date("2026-03-11T11:00:00.000Z"),
      billable: true,
      note: "Zoe website",
    },
    now,
    zoe.id,
  );
  await createManualEntry(
    {
      projectId: brochure.id,
      startedAt: new Date("2026-03-11T12:00:00.000Z"),
      endedAt: new Date("2026-03-11T13:00:00.000Z"),
      billable: true,
      note: "Zoe brochure",
    },
    now,
    zoe.id,
  );
  await createManualEntry(
    {
      projectId: website.id,
      startedAt: new Date("2026-03-11T14:00:00.000Z"),
      endedAt: new Date("2026-03-11T15:00:00.000Z"),
      billable: true,
      note: "Owner website",
    },
    now,
    owner.id,
  );

  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const page = await ownerContext.newPage();
    const grouped =
      "/reports/time-activity?preset=custom&from=2026-03-01&to=2026-03-31&group=member&then=project&sort=name-asc";
    await page.goto(grouped);
    await expect(page.getByRole("heading", { name: "Time & Activity" })).toBeVisible();
    await expect(page.getByLabel("Group by")).toHaveValue("member");
    await expect(page.getByLabel("Then by")).toHaveValue("project");
    await expect(page.getByLabel("Sort")).toHaveValue("name-asc");
    await expect(page.getByRole("option", { name: "To-do" }).first()).toBeAttached();

    const subtotals = page.locator("[data-row-kind=subtotal]");
    await expect(subtotals).toHaveCount(2);
    await expect(subtotals.nth(0)).toContainText("E2E Owner");
    await expect(subtotals.nth(0)).toContainText("1h");
    await expect(subtotals.nth(1)).toContainText("Zoe Member");
    await expect(subtotals.nth(1)).toContainText("3h");
    await expect(page.locator("tbody tr").nth(1)).toContainText("Website Group");
    await expect(page.locator("tfoot")).toContainText("Grand total");
    await expect(page.locator("tfoot")).toContainText("4h");
    await expect(page.locator("tfoot")).toContainText("USD 200.00");
    await expect(page.getByRole("columnheader", { name: /Member/ })).toHaveAttribute("aria-sort", "ascending");

    await page.getByRole("columnheader", { name: /Hours/ }).getByRole("link").click();
    await expect(page).toHaveURL(/sort=time-desc/);
    await expect(page.getByRole("columnheader", { name: /Hours/ })).toHaveAttribute("aria-sort", "descending");
    await expect(page.locator("[data-row-kind=subtotal]").nth(0)).toContainText("Zoe Member");
    await expect(page.locator("[data-row-kind=subtotal]").nth(0)).toContainText("3h");
    await expect(page.locator("tbody tr").nth(1)).toContainText("Website Group");
    await expect(page.locator("tbody tr").nth(2)).toContainText("Brochure Group");
    await expect(page.getByText("Activity %")).toHaveCount(0);
    await expect(page.getByText("Screenshot")).toHaveCount(0);

    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/time-activity-grouped.png`, fullPage: true });

    const pdfResponse = await page.request.get(
      "/reports/time-activity/export?preset=custom&from=2026-03-01&to=2026-03-31&group=member&then=project&sort=time-desc&format=pdf",
    );
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    const pdf = await pdfResponse.body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    await writeFile(`${artifacts}/time-activity-grouped.pdf`, pdf);
    await execFileAsync("pdftotext", ["-layout", `${artifacts}/time-activity-grouped.pdf`, "-"]).then(({ stdout }) => {
      expect(stdout).toContain("Zoe Member");
      expect(stdout).toContain("Website Group");
      expect(stdout).toContain("Grand total");
      expect(stdout).toContain("USD 200.00");
      expect(stdout).not.toMatch(/Screenshot|Activity %/);
    });
    await execFileAsync("pdftoppm", [
      "-png",
      "-f",
      "1",
      "-l",
      "1",
      "-r",
      "120",
      `${artifacts}/time-activity-grouped.pdf`,
      `${artifacts}/time-activity-grouped-pdf`,
    ]);

    const csvResponse = await page.request.get(
      "/reports/time-activity/export?preset=custom&from=2026-03-01&to=2026-03-31&group=member&then=project&sort=time-desc",
    );
    const csv = await csvResponse.text();
    expect(csv).toContain("Zoe Member");
    expect(csv).toContain("Website Group");
    expect(csv).toContain("Grand total");
    expect(csv).toContain("200.00");
    const zoeLine = csv.split("\r\n").find((line) => line.startsWith("Zoe Member,"));
    expect(zoeLine).toBeTruthy();
    expect(zoeLine).not.toMatch(/Billable|No rate/);

    await signIn(memberContext, prisma, zoe.email);
    const memberPage = await memberContext.newPage();
    await memberPage.goto(
      "/reports/time-activity?preset=custom&from=2026-03-01&to=2026-03-31&group=member&then=member&sort=amount-USD-desc",
    );
    await expect(memberPage.getByRole("rowheader", { name: "Website Group" })).toBeVisible();
    await expect(memberPage.getByRole("rowheader", { name: "Brochure Group" })).toBeVisible();
    await expect(memberPage.getByText("E2E Owner")).toHaveCount(0);
    await expect(memberPage.getByText("Zoe website")).toHaveCount(0);
    await expect(memberPage.getByRole("option", { name: "Member" })).toHaveCount(0);
    await expect(memberPage.getByRole("option", { name: "Amount high to low" })).toHaveCount(0);
    await expect(memberPage.getByLabel("Sort")).not.toHaveValue(/amount/);
    const html = await memberPage.content();
    expect(markupWithoutScripts(html)).not.toMatch(/USD|JPY|Amount/);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await prisma.$disconnect();
  }
});
