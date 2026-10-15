import "./env";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signIn } from "./auth";
import { markupWithoutScripts } from "./markup";

async function shot(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.ULIXDESK_E2E_ARTIFACTS ?? testInfo.outputDir;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test("saved reports follow the role rules", async ({ browser }, testInfo) => {
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const admin = await prisma.user.create({
    data: { email: "ari-saved@ulix.test", name: "Ari Admin", role: "admin", passwordHash: "unused" },
  });
  const member = await prisma.user.create({
    data: { email: "mia-saved@ulix.test", name: "Mia Saved", role: "member", passwordHash: "unused" },
  });
  const ownerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    await signIn(adminContext, prisma, admin.email);
    await signIn(memberContext, prisma, member.email);
    const ownerPage = await ownerContext.newPage();
    const adminPage = await adminContext.newPage();
    const memberPage = await memberContext.newPage();

    await ownerPage.goto("/reports/time-activity?preset=custom&from=2026-10-01&to=2026-10-31");
    await ownerPage.getByRole("button", { name: "Save report" }).click();
    const dialog = ownerPage.getByRole("dialog", { name: "Save this report" });
    await expect(dialog.getByText("Everyone in the workspace can open this.")).toBeVisible();
    await dialog.getByLabel("Name").fill("October activity");
    await dialog.getByRole("checkbox", { name: /Shared with the workspace/ }).check();
    await shot(ownerPage, testInfo, "saved-report-dialog");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ownerPage.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await expect(ownerPage.getByText("Report saved.")).toBeVisible();
    const saved = ownerPage.getByRole("listitem").filter({ hasText: "October activity" });
    await expect(saved).toBeVisible();
    await expect(saved.getByText("Shared")).toBeVisible();
    await shot(ownerPage, testInfo, "reports-hub-saved");

    await memberPage.goto("/reports");
    const shared = memberPage.getByRole("listitem").filter({ hasText: "October activity" });
    await expect(shared).toBeVisible();
    await expect(shared.getByRole("button", { name: /Delete/ })).toHaveCount(0);
    await expect(shared.getByText("Saved by")).toBeVisible();
    await shared.getByRole("link", { name: "Open" }).click();
    await expect(memberPage.getByRole("heading", { name: "Time & Activity" })).toBeVisible();
    await expect(memberPage.getByText("Owners and admins also see the amount")).toHaveCount(0);
    await expect(memberPage.getByRole("option", { name: "Member" })).toHaveCount(0);
    const memberHtml = await memberPage.content();
    expect(markupWithoutScripts(memberHtml)).not.toMatch(/USD|JPY/);

    await memberPage.getByRole("button", { name: "Save report" }).click();
    const memberDialog = memberPage.getByRole("dialog", { name: "Save this report" });
    await expect(memberDialog.getByRole("checkbox", { name: /Shared with the workspace/ })).toHaveCount(0);
    await memberDialog.getByLabel("Name").fill("Mine");
    await memberDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(memberPage.getByText("Report saved.")).toBeVisible();
    await expect(memberPage.getByRole("listitem").filter({ hasText: "Mine" })).toBeVisible();

    await ownerPage.goto("/reports");
    await expect(ownerPage.getByRole("listitem").filter({ hasText: "Mine" })).toHaveCount(0);

    await adminPage.goto("/reports");
    const adminRow = adminPage.getByRole("listitem").filter({ hasText: "October activity" });
    await adminRow.getByLabel("Name").fill("October totals");
    await adminRow.getByRole("button", { name: "Rename" }).click();
    await expect(adminPage.getByText("Saved report renamed.")).toBeVisible();
    const renamed = adminPage.getByRole("listitem").filter({ hasText: "October totals" });
    await renamed.getByRole("button", { name: /Delete/ }).click();
    await adminPage.getByRole("dialog", { name: "Delete this saved report?" }).getByRole("button", { name: "Delete" }).click();
    await expect(adminPage.getByText("Saved report deleted.")).toBeVisible();
    await expect(adminPage.getByText("October totals")).toHaveCount(0);

    const mine = memberPage.getByRole("listitem").filter({ hasText: "Mine" });
    await memberPage.goto("/reports");
    await mine.getByRole("button", { name: /Delete/ }).click();
    await memberPage.getByRole("dialog", { name: "Delete this saved report?" }).getByRole("button", { name: "Delete" }).click();
    await expect(memberPage.getByText("Saved report deleted.")).toBeVisible();
  } finally {
    await ownerContext.close();
    await adminContext.close();
    await memberContext.close();
    await prisma.savedReport.deleteMany({
      where: { createdById: { in: [owner.id, admin.id, member.id] } },
    });
    await prisma.session.deleteMany({ where: { userId: { in: [admin.id, member.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, member.id] } } });
    await prisma.$disconnect();
  }
});
