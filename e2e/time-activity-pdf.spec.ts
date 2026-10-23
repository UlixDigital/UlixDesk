import "./env";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test, type TestInfo } from "@playwright/test";
import { saveClientRate } from "../src/lib/bill-rates";
import { deleteTimeChangesForTests } from "../src/lib/reset-test-db";
import { createManualEntry } from "../src/lib/time-entries";
import { activityFooterHost } from "../src/lib/time-activity-pdf";
import { createTodo } from "../src/lib/todos";
import { signIn } from "./auth";

function artifactDir(testInfo: TestInfo) {
  return process.env.ULIXDESK_E2E_ARTIFACTS ?? testInfo.outputDir;
}

test("time and activity PDF matches the reference hierarchy", async ({ browser }, testInfo) => {
  const artifacts = artifactDir(testInfo);
  const prisma = new PrismaClient();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });
  const zoe = await prisma.user.create({
    data: {
      email: "zoe-pdf@ulix.test",
      name: "Zoe Pdf",
      role: "member",
      passwordHash: "unused",
    },
  });
  const client = await prisma.client.create({ data: { name: "Pdf Client", currency: "USD" } });
  const palms = await prisma.project.create({
    data: { name: "Palms Trading Pdf", clientId: client.id, billable: true },
  });
  const accessories = await prisma.project.create({
    data: { name: "Accessories Pdf", clientId: client.id, billable: true },
  });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "UTC", defaultCurrency: "USD", companyName: "Ulix Digital" },
    create: { id: "workspace", timeZone: "UTC", defaultCurrency: "USD", companyName: "Ulix Digital" },
  });
  expect(
    (
      await saveClientRate({
        clientId: client.id,
        amountRaw: "50",
        effectiveFrom: "2020-01-01",
        createdById: owner.id,
      })
    ).ok,
  ).toBe(true);
  const actor = { id: owner.id, role: owner.role };
  const blogs = await createTodo({
    actor,
    projectId: palms.id,
    title: "Publishing blogs",
    assigneeIds: [owner.id, zoe.id],
  });
  const maintenance = await createTodo({
    actor,
    projectId: accessories.id,
    title: "Wp maintenance",
    assigneeIds: [owner.id],
  });
  expect(blogs.ok).toBe(true);
  expect(maintenance.ok).toBe(true);
  if (!blogs.ok || !maintenance.ok) return;
  const now = new Date();
  await createManualEntry(
    {
      projectId: palms.id,
      startedAt: new Date("2026-10-12T10:00:00.000Z"),
      endedAt: new Date("2026-10-12T12:00:00.000Z"),
      billable: true,
      note: "Called the client",
      todoId: blogs.todo.id,
    },
    now,
    owner.id,
  );
  await prisma.timeEntry.create({
    data: {
      projectId: palms.id,
      userId: zoe.id,
      startedAt: new Date("2026-10-12T08:00:00.000Z"),
      endedAt: new Date("2026-10-12T09:00:00.000Z"),
      billable: true,
      note: "Zoe timer",
      source: "timer",
      todoId: blogs.todo.id,
    },
  });
  await prisma.timeEntry.create({
    data: {
      projectId: accessories.id,
      userId: owner.id,
      startedAt: new Date("2026-10-13T13:00:00.000Z"),
      endedAt: new Date("2026-10-13T14:00:00.000Z"),
      billable: true,
      note: "",
      source: "timer",
      todoId: maintenance.todo.id,
    },
  });

  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    await signIn(ownerContext, prisma, owner.email);
    const ownerPage = await ownerContext.newPage();
    const exportPath = `/reports/time-activity/export?preset=custom&from=2026-10-12&to=2026-10-18&client=${client.id}&format=pdf`;
    const ownerPdf = await ownerPage.request.get(exportPath);
    expect(ownerPdf.status()).toBe(200);
    const ownerBody = await ownerPdf.body();
    expect(ownerBody.subarray(0, 5).toString()).toBe("%PDF-");
    await mkdir(artifacts, { recursive: true });
    const ownerPath = `${artifacts}/time-activity-owner.pdf`;
    await writeFile(ownerPath, ownerBody);
    const ownerText = execFileSync("pdftotext", ["-layout", ownerPath, "-"], { encoding: "utf8" });
    expect(ownerText).toContain("Time & Activity Report");
    expect(ownerText).toContain("Ulix Digital");
    expect(ownerText).toContain("Mon, Oct 12, 2026 - Sun, Oct 18, 2026");
    expect(ownerText).toContain("Grand total");
    expect(ownerText).toContain("4:00:00");
    expect(ownerText).toContain("$200.00");
    expect(ownerText).not.toContain("To-do ID");
    expect(ownerText).toContain("To-dos");
    expect(ownerText).toContain("Notes");
    expect(ownerText).toContain("Accessories Pdf");
    expect(ownerText).toContain("Palms Trading Pdf");
    expect(ownerText).toContain("E2E Owner");
    expect(ownerText).toContain("Zoe Pdf");
    expect(ownerText).toContain("Publishing blogs");
    expect(ownerText).toContain("Wp maintenance");
    expect(ownerText).toContain("Manually added; Called the client");
    expect(ownerText).toContain("Zoe timer");
    expect(ownerText.match(/Manually added/g)).toHaveLength(1);
    // The header range contains this date once. The second member on that date leaves Date blank.
    expect(ownerText.match(/Mon, Oct 12, 2026/g)).toHaveLength(2);
    expect(ownerText).toContain("Tue, Oct 13, 2026");
    expect(ownerText).toContain("Generated with UlixDesk");
    expect(ownerText).toContain(activityFooterHost(process.env.ULIXDESK_PUBLIC_ORIGIN));
    expect(ownerText).not.toContain("(continued)");
    expect(ownerText).not.toMatch(/Screenshot|Activity %|Page 1 of/);

    await signIn(memberContext, prisma, zoe.email);
    const memberPage = await memberContext.newPage();
    const memberPdf = await memberPage.request.get(`${exportPath}&columns=hours,amount`);
    expect(memberPdf.status()).toBe(200);
    const memberPath = `${artifacts}/time-activity-member.pdf`;
    await writeFile(memberPath, await memberPdf.body());
    const memberText = execFileSync("pdftotext", ["-layout", memberPath, "-"], { encoding: "utf8" });
    expect(memberText).toContain("Zoe Pdf");
    expect(memberText).toContain("Palms Trading Pdf");
    expect(memberText).toContain("Publishing blogs");
    expect(memberText).toContain("1:00:00");
    expect(memberText).toContain("Billable Time");
    expect(memberText).not.toContain("To-do ID");
    expect(memberText).toContain("To-dos");
    expect(memberText).not.toContain("E2E Owner");
    expect(memberText).not.toContain("Accessories Pdf");
    expect(memberText).not.toContain("Manually added");
    expect(memberText).not.toMatch(/\$|Billed|USD/);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await deleteTimeChangesForTests(prisma);
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [palms.id, accessories.id] } } });
    await prisma.billRate.deleteMany({ where: { clientId: client.id } });
    await prisma.session.deleteMany({ where: { userId: zoe.id } });
    await prisma.project.deleteMany({ where: { id: { in: [palms.id, accessories.id] } } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: zoe.id } });
    await prisma.$disconnect();
  }
});
