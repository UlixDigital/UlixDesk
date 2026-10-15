import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BudgetReachedError, listBudgetReport, projectBudgetProgress, saveBudget } from "@/lib/budgets";
import { budgetCsvHasMoney, budgetReportCsv } from "@/lib/budget-report";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createProject } from "@/lib/projects";
import { signInAs } from "@/lib/test-actor";
import { timeCopy } from "@/lib/time-copy";
import { createManualEntry, startTimer } from "@/lib/time-entries";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("budgets", () => {
  it("lets a manager save a budget and hides money from a member", async () => {
    const owner = await signInAs("owner", "budget-owner@ulix.test");
    const member = await signInAs("member", "budget-member@ulix.test");
    const client = await prisma.client.create({ data: { name: "Acme", currency: "USD" } });
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: client.id,
      billable: true,
    });
    const saved = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "project",
      projectId: project.id,
      form: {
        basis: "hours",
        amount: "2",
        recurrence: "weekly",
        startsOn: "",
        billableOnly: true,
        alertPercent: "80",
        hardStop: false,
      },
    });
    expect(saved.ok).toBe(true);
    const cost = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "client",
      clientId: client.id,
      form: {
        basis: "cost",
        amount: "100",
        recurrence: "total",
        startsOn: "",
        billableOnly: true,
        alertPercent: "",
        hardStop: true,
      },
    });
    expect(cost.ok).toBe(true);
    const clientRow = await prisma.budget.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(clientRow.hardStop).toBe(false);
    expect(clientRow.currency).toBe("USD");

    const denied = await saveBudget({
      actorRole: member.user.role,
      actorId: member.user.id,
      scope: "project",
      projectId: project.id,
      form: {
        basis: "hours",
        amount: "1",
        recurrence: "total",
        startsOn: "",
        billableOnly: true,
        alertPercent: "",
        hardStop: true,
      },
    });
    expect(denied.ok).toBe(false);

    const now = new Date("2026-10-15T08:00:00.000Z");
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T04:00:00.000Z"),
        endedAt: new Date("2026-10-15T05:00:00.000Z"),
        billable: true,
        note: "",
      },
      now,
      member.user.id,
    );
    const progress = await projectBudgetProgress({
      projectId: project.id,
      role: member.user.role,
      userId: member.user.id,
      now,
    });
    expect(progress?.figures.budgetLabel).toContain("hours");
    expect(JSON.stringify(progress)).not.toMatch(/USD|\$/);

    const report = await listBudgetReport({
      actor: member.user,
      filters: { clientId: "", projectId: "", includeArchived: false, kind: "all" },
      now,
    });
    expect(report.showMoney).toBe(false);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.basis).toBe("hours");
    const csv = budgetReportCsv(report.rows, report.showMoney);
    expect(budgetCsvHasMoney(csv)).toBe(false);

    const ownerReport = await listBudgetReport({
      actor: owner.user,
      filters: { clientId: "", projectId: "", includeArchived: false, kind: "clients" },
      now,
    });
    expect(ownerReport.rows.map((row) => row.name)).toEqual(["Acme"]);
    expect(ownerReport.rows[0]?.status).toBe("No rate");
  });

  it("allows the entry that crosses 100% and blocks the next start and manual entry", async () => {
    const owner = await signInAs("owner", "stop-owner@ulix.test");
    const project = await createProject({
      name: "Limited",
      description: null,
      clientId: null,
      billable: true,
    });
    expect(
      (
        await saveBudget({
          actorRole: owner.user.role,
          actorId: owner.user.id,
          scope: "project",
          projectId: project.id,
          form: {
            basis: "hours",
            amount: "1",
            recurrence: "total",
            startsOn: "",
            billableOnly: false,
            alertPercent: "80",
            hardStop: true,
          },
        })
      ).ok,
    ).toBe(true);

    const now = new Date("2026-10-15T12:00:00.000Z");
    const first = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T01:00:00.000Z"),
        endedAt: new Date("2026-10-15T01:30:00.000Z"),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    expect(first.entry.id).toBeTruthy();
    const crossing = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T02:00:00.000Z"),
        endedAt: new Date("2026-10-15T02:40:00.000Z"),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    expect(crossing.entry.id).toBeTruthy();

    await expect(
      createManualEntry(
        {
          projectId: project.id,
          startedAt: new Date("2026-10-15T03:00:00.000Z"),
          endedAt: new Date("2026-10-15T03:10:00.000Z"),
          billable: true,
          note: "",
        },
        now,
        owner.user.id,
      ),
    ).rejects.toBeInstanceOf(BudgetReachedError);

    const started = await startTimer({
      projectId: project.id,
      note: "",
      now,
      userId: owner.user.id,
    });
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.code).toBe("budget-reached");
    expect(timeCopy.budgetReached).not.toMatch(/USD|\$|hours|%/);
  });
});
