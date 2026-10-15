import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { saveClientRate } from "@/lib/bill-rates";
import { createClient } from "@/lib/clients";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { reportCopy } from "@/lib/report-copy";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { buildReport, loadReportEntries, reportToCsv } from "@/lib/reports";
import { createTestUser } from "@/lib/test-actor";
import { createManualEntry } from "@/lib/time-entries";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

let ownerId = "";
let memberId = "";

beforeEach(async () => {
  await resetTestDatabase();
  ownerId = (await createTestUser("owner", "owner-reports@ulix.test")).id;
  await prisma.user.update({ where: { id: ownerId }, data: { name: "Olivia Owner" } });
  memberId = (await createTestUser("member", "member-reports@ulix.test")).id;
  await prisma.user.update({ where: { id: memberId }, data: { name: "Mia Member" } });
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { timeZone: "UTC", defaultCurrency: "USD" },
    create: { id: "workspace", timeZone: "UTC", defaultCurrency: "USD" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("report visibility", () => {
  it("limits members to their own rows and keeps currencies apart", async () => {
    const acme = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
      currency: "USD",
    });
    const tokyo = await createClient({
      name: "Tokyo",
      address: null,
      phone: null,
      emails: [],
      currency: "JPY",
    });
    expect((await saveClientRate({
      clientId: acme.id,
      amountRaw: "100",
      effectiveFrom: "2020-01-01",
      createdById: ownerId,
    })).ok).toBe(true);
    expect((await saveClientRate({
      clientId: tokyo.id,
      amountRaw: "1500",
      effectiveFrom: "2020-01-01",
      createdById: ownerId,
    })).ok).toBe(true);
    const website = await createProject({
      name: "Website",
      description: null,
      clientId: acme.id,
      billable: true,
    });
    const brochure = await createProject({
      name: "Brochure",
      description: null,
      clientId: tokyo.id,
      billable: true,
    });
    const now = new Date("2026-10-15T12:00:00.000Z");
    await createManualEntry(
      {
        projectId: website.id,
        startedAt: new Date("2026-10-15T09:00:00.000Z"),
        endedAt: new Date("2026-10-15T10:00:00.000Z"),
        billable: true,
        note: "Owner hour",
      },
      now,
      ownerId,
    );
    await createManualEntry(
      {
        projectId: brochure.id,
        startedAt: new Date("2026-10-15T09:00:00.000Z"),
        endedAt: new Date("2026-10-15T11:00:00.000Z"),
        billable: true,
        note: "=member note",
      },
      now,
      memberId,
    );

    const range = {
      from: zonedDayStart("2026-10-12", "UTC"),
      to: zonedDayEnd("2026-10-18", "UTC"),
      timeZone: "UTC",
      clientId: null,
      projectId: null,
      billable: "all" as const,
      memberId: null,
    };
    const ownerLoaded = await loadReportEntries({
      actor: { id: ownerId, role: "owner" },
      ...range,
    });
    const memberLoaded = await loadReportEntries({
      actor: { id: memberId, role: "member" },
      ...range,
      memberId: ownerId,
    });
    expect(ownerLoaded.ok && memberLoaded.ok).toBe(true);
    if (!ownerLoaded.ok || !memberLoaded.ok) return;

    const ownerReport = buildReport({
      kind: "time-activity",
      entries: ownerLoaded.entries,
      rangeStart: range.from,
      rangeEnd: range.to,
      timeZone: "UTC",
      groupBy: "member",
      columns: ["hours", "billableHours", "amount"],
      showMoney: ownerLoaded.showMoney,
      manager: ownerLoaded.manager,
    });
    expect(ownerReport.rows.map((row) => row.cells.group).sort()).toEqual([
      "Mia Member",
      "Olivia Owner",
    ]);
    expect(ownerReport.totals?.["amount:USD"]).toBe("USD 100.00");
    expect(ownerReport.totals?.["amount:JPY"]).toBe("JPY 3,000");
    const ownerCsv = reportToCsv(ownerReport);
    expect(ownerCsv).toContain("Amount (USD)");
    expect(ownerCsv).toContain("Amount (JPY)");
    expect(ownerCsv).not.toContain("USD 100.00 JPY");

    const memberReport = buildReport({
      kind: "work-sessions",
      entries: memberLoaded.entries,
      rangeStart: range.from,
      rangeEnd: range.to,
      timeZone: "UTC",
      groupBy: "project",
      columns: ["start", "duration", "project", "client", "notes", "billable", "amount", "member"],
      showMoney: memberLoaded.showMoney,
      manager: memberLoaded.manager,
      allRows: true,
    });
    expect(memberLoaded.entries).toHaveLength(1);
    expect(memberLoaded.showMoney).toBe(false);
    expect(memberReport.rows).toHaveLength(1);
    expect(memberReport.rows[0]?.cells.notes).toBe("=member note");
    expect(memberReport.columns.some((column) => column.id.includes("amount") || column.id === "member")).toBe(
      false,
    );
    const memberCsv = reportToCsv(memberReport);
    expect(memberCsv).toContain("'=member note");
    expect(memberCsv).not.toMatch(/USD|JPY|Amount/);
    expect(memberCsv).not.toContain(reportCopy.amount);
  });
});
