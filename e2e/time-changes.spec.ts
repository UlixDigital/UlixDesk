import "./env";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { createManualEntry, deleteTimeEntry, startTimer, stopTimer, updateManualEntry } from "../src/lib/time-entries";
import { signIn } from "./auth";

const shots = "/opt/cursor/artifacts";

test("owners see every time change and members see only their own", async ({ browser }) => {
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const sam = await prisma.user.create({
    data: { email: "sam-edits@ulix.test", name: "Sam Member", role: "member", passwordHash: "unused" },
  });
  const jane = await prisma.user.create({
    data: { email: "jane-edits@ulix.test", name: "Jane Admin", role: "admin", passwordHash: "unused" },
  });
  const client = await prisma.client.create({ data: { name: "Acme" } });
  const website = await prisma.project.create({
    data: { name: "Website", clientId: client.id, billable: true },
  });
  const internal = await prisma.project.create({
    data: { name: "Internal", billable: false },
  });
  const changedAt = new Date();
  const startedAt = new Date("2026-10-15T02:00:00.000Z");
  const endedAt = new Date("2026-10-15T03:00:00.000Z");
  const created = await createManualEntry(
    { projectId: website.id, startedAt, endedAt, billable: true, note: "Sam's draft" },
    changedAt,
    sam.id,
    { actorId: sam.id, source: "web", changedAt },
  );
  await updateManualEntry(
    created.entry.id,
    {
      projectId: website.id,
      startedAt,
      endedAt: new Date("2026-10-15T03:30:00.000Z"),
      billable: true,
      note: "Called the client",
    },
    changedAt,
    sam.id,
    { actorId: jane.id, source: "web", changedAt },
  );
  const removed = await createManualEntry(
    {
      projectId: internal.id,
      startedAt,
      endedAt,
      billable: false,
      note: "Owner only",
    },
    changedAt,
    owner.id,
    { actorId: owner.id, source: "web", changedAt },
  );
  await deleteTimeEntry(removed.entry.id, null, {
    actorId: owner.id,
    source: "web",
    changedAt,
  });
  const timerStart = new Date(changedAt.getTime() - 60_000);
  await startTimer({
    userId: sam.id,
    projectId: website.id,
    note: "Extension focus",
    now: timerStart,
    source: "extension",
  });
  await stopTimer(new Date(timerStart.getTime() + 5_000), sam.id, { source: "extension" });

  await mkdir(shots, { recursive: true });
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/reports/manual-time-edits");
    const filters = ownerPage.getByRole("form", { name: "Filters" });
    await expect(ownerPage.getByRole("heading", { name: "Manual time edits" })).toBeVisible();
    await expect(ownerPage.getByText("Time entries that already existed before this log have no history.")).toBeVisible();
    await expect(filters.getByLabel("From")).toBeVisible();
    await expect(filters.getByLabel("Client")).toBeVisible();
    await expect(filters.getByLabel("Project")).toBeVisible();
    await expect(filters.getByLabel("Member")).toBeVisible();
    await expect(filters.getByLabel("Action")).toBeVisible();
    await expect(ownerPage.getByText("Edited by Jane Admin for Sam Member")).toBeVisible();
    await expect(ownerPage.getByText("Owner only").first()).toBeVisible();
    await expect(ownerPage.getByText("Extension").first()).toBeVisible();
    await expect(ownerPage.getByText("Customers")).toHaveCount(0);
    await ownerPage.screenshot({ path: `${shots}/manual_time_edits_owner.png`, fullPage: true });
    await ownerPage.locator("form[aria-label='Filters']").screenshot({
      path: `${shots}/manual_time_edits_filters.png`,
    });
    await filters.getByLabel("Action").selectOption("deleted");
    await ownerPage.waitForURL(/action=deleted/);
    await expect(ownerPage.getByText("Deleted by E2E Owner")).toBeVisible();
    await expect(ownerPage.getByText("Edited by Jane Admin for Sam Member")).toHaveCount(0);

    await signIn(memberContext, prisma, sam.email);
    const memberPage = await memberContext.newPage();
    const response = await memberPage.goto("/reports/manual-time-edits");
    expect(response?.status()).toBe(200);
    const html = await response?.text();
    expect(html ?? "").not.toContain("Owner only");
    expect(html ?? "").not.toMatch(/USD|JPY|amountMinor/);
    await expect(memberPage.getByText("Edited by Jane Admin for Sam Member")).toBeVisible();
    await expect(memberPage.getByText("You see changes to your own time.")).toBeVisible();
    await expect(memberPage.getByRole("form", { name: "Filters" }).getByLabel("Member")).toHaveCount(0);
    await expect(memberPage.getByText("Owner only")).toHaveCount(0);
    await memberPage.screenshot({ path: `${shots}/manual_time_edits_member.png`, fullPage: true });
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await prisma.$executeRaw`TRUNCATE TABLE "TimeChange"`;
    await prisma.runningTimer.deleteMany({ where: { id: { in: [sam.id, jane.id, owner.id] } } });
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [website.id, internal.id] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [sam.id, jane.id] } } });
    await prisma.project.deleteMany({ where: { id: { in: [website.id, internal.id] } } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.user.deleteMany({ where: { id: { in: [sam.id, jane.id] } } });
    await prisma.$disconnect();
  }
});
