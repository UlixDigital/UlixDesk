import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  BudgetReachedError,
  budgetAlertForViewer,
  listBudgetReport,
  projectBudgetProgress,
  saveBudget,
} from "@/lib/budgets";
import { budgetCodes, budgetCopy } from "@/lib/budget-copy";
import { budgetCsvHasMoney, budgetReportCsv } from "@/lib/budget-report";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createProject } from "@/lib/projects";
import { rateCopy } from "@/lib/rate-copy";
import { signInAs } from "@/lib/test-actor";
import { timeCopy } from "@/lib/time-copy";
import { createManualEntry, startTimer, updateManualEntry } from "@/lib/time-entries";
import { zonedDayStart } from "@/lib/time-zone";

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
        hardStop: false,
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

  it("blocks a member, and any other role, from moving an entry onto a reached project", async () => {
    const owner = await signInAs("owner", "move-owner@ulix.test");
    const member = await signInAs("member", "move-member@ulix.test");
    const open = await createProject({
      name: "Open",
      description: null,
      clientId: null,
      billable: true,
    });
    const capped = await createProject({
      name: "Capped",
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
          projectId: capped.id,
          form: {
            basis: "hours",
            amount: "1",
            recurrence: "total",
            startsOn: "",
            billableOnly: true,
            alertPercent: "",
            hardStop: true,
          },
        })
      ).ok,
    ).toBe(true);

    const now = new Date("2026-10-15T12:00:00.000Z");
    await createManualEntry(
      {
        projectId: capped.id,
        startedAt: new Date("2026-10-15T01:00:00.000Z"),
        endedAt: new Date("2026-10-15T02:10:00.000Z"),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    const startedAt = new Date("2026-10-15T04:00:00.000Z");
    const endedAt = new Date("2026-10-15T04:15:00.000Z");
    const mine = await createManualEntry(
      { projectId: open.id, startedAt, endedAt, billable: false, note: "" },
      now,
      member.user.id,
    );
    const moved = {
      projectId: capped.id,
      startedAt,
      endedAt,
      billable: false,
      note: "moved",
    };
    await expect(updateManualEntry(mine.entry.id, moved, now, member.user.id)).rejects.toBeInstanceOf(
      BudgetReachedError,
    );
    const row = await prisma.timeEntry.findUniqueOrThrow({ where: { id: mine.entry.id } });
    expect(row.projectId).toBe(open.id);
    expect(row.note).toBe("");
  });

  it("evaluates the week the entry starts in, not the current week", async () => {
    const owner = await signInAs("owner", "week-owner@ulix.test");
    const lastWeek = await createProject({
      name: "Last week capped",
      description: null,
      clientId: null,
      billable: true,
    });
    const thisWeek = await createProject({
      name: "This week capped",
      description: null,
      clientId: null,
      billable: true,
    });
    for (const projectId of [lastWeek.id, thisWeek.id]) {
      expect(
        (
          await saveBudget({
            actorRole: owner.user.role,
            actorId: owner.user.id,
            scope: "project",
            projectId,
            form: {
              basis: "hours",
              amount: "1",
              recurrence: "weekly",
              startsOn: "",
              billableOnly: false,
              alertPercent: "",
              hardStop: true,
            },
          })
        ).ok,
      ).toBe(true);
    }

    const lastTuesday = zonedDayStart("2026-10-06", "Asia/Colombo");
    const thisThursday = zonedDayStart("2026-10-15", "Asia/Colombo");
    const now = new Date(thisThursday.getTime() + 12 * 60 * 60 * 1000);
    const hour = 60 * 60_000;

    await createManualEntry(
      {
        projectId: lastWeek.id,
        startedAt: lastTuesday,
        endedAt: new Date(lastTuesday.getTime() + hour),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    await expect(
      createManualEntry(
        {
          projectId: lastWeek.id,
          startedAt: new Date(lastTuesday.getTime() + 2 * hour),
          endedAt: new Date(lastTuesday.getTime() + 2 * hour + 10 * 60_000),
          billable: true,
          note: "",
        },
        now,
        owner.user.id,
      ),
    ).rejects.toBeInstanceOf(BudgetReachedError);

    const current = await createManualEntry(
      {
        projectId: lastWeek.id,
        startedAt: thisThursday,
        endedAt: new Date(thisThursday.getTime() + 10 * 60_000),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    expect(current.entry.id).toBeTruthy();
    await expect(
      updateManualEntry(
        current.entry.id,
        {
          projectId: lastWeek.id,
          startedAt: new Date(lastTuesday.getTime() + 3 * hour),
          endedAt: new Date(lastTuesday.getTime() + 3 * hour + 10 * 60_000),
          billable: true,
          note: "",
        },
        now,
        owner.user.id,
      ),
    ).rejects.toBeInstanceOf(BudgetReachedError);

    await createManualEntry(
      {
        projectId: thisWeek.id,
        startedAt: thisThursday,
        endedAt: new Date(thisThursday.getTime() + hour),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    await expect(
      createManualEntry(
        {
          projectId: thisWeek.id,
          startedAt: new Date(thisThursday.getTime() + 2 * hour),
          endedAt: new Date(thisThursday.getTime() + 2 * hour + 10 * 60_000),
          billable: true,
          note: "",
        },
        now,
        owner.user.id,
      ),
    ).rejects.toBeInstanceOf(BudgetReachedError);
    const earlier = await createManualEntry(
      {
        projectId: thisWeek.id,
        startedAt: lastTuesday,
        endedAt: new Date(lastTuesday.getTime() + 30 * 60_000),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    expect(earlier.entry.projectId).toBe(thisWeek.id);
  });

  it("blocks edits that increase counted usage and allows edits that do not", async () => {
    const owner = await signInAs("owner", "edit-owner@ulix.test");
    const project = await createProject({
      name: "Reached",
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
            billableOnly: true,
            alertPercent: "",
            hardStop: true,
          },
        })
      ).ok,
    ).toBe(true);

    const now = new Date("2026-10-15T12:00:00.000Z");
    const startedAt = new Date("2026-10-15T01:00:00.000Z");
    const quietStart = new Date("2026-10-15T05:00:00.000Z");
    const quiet = await createManualEntry(
      {
        projectId: project.id,
        startedAt: quietStart,
        endedAt: new Date(quietStart.getTime() + 15 * 60_000),
        billable: false,
        note: "",
      },
      now,
      owner.user.id,
    );
    const entry = await createManualEntry(
      {
        projectId: project.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 50 * 60_000),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    const crossed = await updateManualEntry(
      entry.entry.id,
      {
        projectId: project.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 70 * 60_000),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    expect(crossed?.entry.id).toBe(entry.entry.id);

    await expect(
      updateManualEntry(
        entry.entry.id,
        {
          projectId: project.id,
          startedAt,
          endedAt: new Date(startedAt.getTime() + 80 * 60_000),
          billable: true,
          note: "",
        },
        now,
        owner.user.id,
      ),
    ).rejects.toBeInstanceOf(BudgetReachedError);
    const unchanged = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.entry.id } });
    expect(unchanged.endedAt?.toISOString()).toBe(new Date(startedAt.getTime() + 70 * 60_000).toISOString());

    const noted = await updateManualEntry(
      entry.entry.id,
      {
        projectId: project.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 70 * 60_000),
        billable: true,
        note: "same length",
      },
      now,
      owner.user.id,
    );
    expect(noted?.entry.note).toBe("same length");

    const shorter = await updateManualEntry(
      entry.entry.id,
      {
        projectId: project.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 40 * 60_000),
        billable: true,
        note: "same length",
      },
      now,
      owner.user.id,
    );
    expect(shorter?.entry.endedAt.toISOString()).toBe(new Date(startedAt.getTime() + 40 * 60_000).toISOString());

    const reachedAgain = await updateManualEntry(
      entry.entry.id,
      {
        projectId: project.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 70 * 60_000),
        billable: true,
        note: "same length",
      },
      now,
      owner.user.id,
    );
    expect(reachedAgain?.entry.id).toBe(entry.entry.id);

    await expect(
      updateManualEntry(
        quiet.entry.id,
        {
          projectId: project.id,
          startedAt: quietStart,
          endedAt: new Date(quietStart.getTime() + 15 * 60_000),
          billable: true,
          note: "",
        },
        now,
        owner.user.id,
      ),
    ).rejects.toBeInstanceOf(BudgetReachedError);

    const unpaid = await updateManualEntry(
      entry.entry.id,
      {
        projectId: project.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 70 * 60_000),
        billable: false,
        note: "same length",
      },
      now,
      owner.user.id,
    );
    expect(unpaid?.entry.billable).toBe(false);
  });

  it("returns an alert warning from a manual add and a timer start", async () => {
    const owner = await signInAs("owner", "alert-owner@ulix.test");
    const project = await createProject({
      name: "Alerted",
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
            billableOnly: true,
            alertPercent: "80",
            hardStop: false,
          },
        })
      ).ok,
    ).toBe(true);

    const now = new Date("2026-10-15T12:00:00.000Z");
    const added = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T01:00:00.000Z"),
        endedAt: new Date("2026-10-15T01:50:00.000Z"),
        billable: true,
        note: "",
      },
      now,
      owner.user.id,
    );
    expect(added.warnings).toEqual([budgetCopy.warning("83.3%", 80)]);

    const started = await startTimer({
      projectId: project.id,
      note: "",
      now,
      userId: owner.user.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.warning).toBe(budgetCopy.warning("83.3%", 80));
  });

  it("rejects a client hard stop and names an amount that is too large or too precise", async () => {
    const owner = await signInAs("owner", "amount-owner@ulix.test");
    const tokyo = await prisma.client.create({ data: { name: "Tokyo", currency: "JPY" } });
    const acme = await prisma.client.create({ data: { name: "Acme Amounts", currency: "USD" } });
    const project = await createProject({
      name: "Amounts",
      description: null,
      clientId: acme.id,
      billable: true,
    });
    const form = {
      basis: "cost",
      amount: "100",
      recurrence: "total",
      startsOn: "",
      billableOnly: true,
      alertPercent: "",
      hardStop: true,
    };
    const clientStop = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "client",
      clientId: tokyo.id,
      form,
    });
    expect(clientStop).toEqual({
      ok: false,
      code: budgetCodes.BUDGET_HARD_STOP,
      error: budgetCopy.clientHardStop,
    });
    expect(await prisma.budget.findUnique({ where: { clientId: tokyo.id } })).toBeNull();

    const yen = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "client",
      clientId: tokyo.id,
      form: { ...form, hardStop: false, amount: "1.5" },
    });
    expect(yen).toEqual({
      ok: false,
      code: budgetCodes.BUDGET_AMOUNT,
      error: rateCopy.amountWhole,
    });

    const precise = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "project",
      projectId: project.id,
      form: { ...form, basis: "hours", hardStop: false, amount: "1.555" },
    });
    expect(precise).toEqual({
      ok: false,
      code: budgetCodes.BUDGET_AMOUNT,
      error: budgetCopy.amountHours,
    });

    const largeHours = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "project",
      projectId: project.id,
      form: { ...form, basis: "hours", hardStop: false, amount: "100001" },
    });
    expect(largeHours).toEqual({
      ok: false,
      code: budgetCodes.BUDGET_AMOUNT,
      error: budgetCopy.amountTooLarge,
    });

    const largeCost = await saveBudget({
      actorRole: owner.user.role,
      actorId: owner.user.id,
      scope: "client",
      clientId: acme.id,
      form: { ...form, hardStop: false, amount: "99999999999" },
    });
    expect(largeCost).toEqual({
      ok: false,
      code: budgetCodes.BUDGET_AMOUNT,
      error: budgetCopy.amountTooLarge,
    });
  });
});

describe("budgetAlertForViewer", () => {
  const at = new Date("2026-10-15T12:00:00.000Z");
  const hoursWarning = budgetCopy.warning("83.3%", 80);
  const costWarning = budgetCopy.warning("90%", 80);

  async function hoursProject(actorId: string, name: string) {
    const project = await createProject({
      name,
      description: null,
      clientId: null,
      billable: true,
    });
    expect(
      (
        await saveBudget({
          actorRole: "owner",
          actorId,
          scope: "project",
          projectId: project.id,
          form: {
            basis: "hours",
            amount: "1",
            recurrence: "total",
            startsOn: "",
            billableOnly: true,
            alertPercent: "80",
            hardStop: false,
          },
        })
      ).ok,
    ).toBe(true);
    return project;
  }

  async function trackedHours(projectId: string, userId: string) {
    return createManualEntry(
      {
        projectId,
        startedAt: new Date("2026-10-15T01:00:00.000Z"),
        endedAt: new Date("2026-10-15T01:50:00.000Z"),
        billable: true,
        note: "",
      },
      at,
      userId,
    );
  }

  it("shows an hours alert to a member who has tracked that project, including the entry just created", async () => {
    const owner = await signInAs("owner", "alert-helper-owner@ulix.test");
    const member = await signInAs("member", "alert-helper-member@ulix.test");
    const project = await hoursProject(owner.user.id, "Member hours");
    expect(
      await budgetAlertForViewer({ userId: member.user.id, projectId: project.id, at }),
    ).toBeNull();

    const added = await trackedHours(project.id, member.user.id);
    expect(added.warnings).toEqual([hoursWarning]);
    expect(await budgetAlertForViewer({ userId: member.user.id, projectId: project.id, at })).toBe(
      hoursWarning,
    );

    const started = await startTimer({
      projectId: project.id,
      note: "",
      now: at,
      userId: member.user.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.warning).toBe(hoursWarning);
  });

  it("returns nothing for a member on a cost budget", async () => {
    const owner = await signInAs("owner", "alert-cost-owner@ulix.test");
    const member = await signInAs("member", "alert-cost-member@ulix.test");
    const client = await prisma.client.create({ data: { name: "Cost Client", currency: "USD" } });
    const project = await createProject({
      name: "Cost project",
      description: null,
      clientId: client.id,
      billable: true,
    });
    await prisma.billRate.create({
      data: {
        scope: "client",
        clientId: client.id,
        amountMinor: 10_000,
        currency: "USD",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.user.id,
      },
    });
    expect(
      (
        await saveBudget({
          actorRole: owner.user.role,
          actorId: owner.user.id,
          scope: "project",
          projectId: project.id,
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
    const added = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-15T02:00:00.000Z"),
        endedAt: new Date("2026-10-15T02:54:00.000Z"),
        billable: true,
        note: "",
      },
      at,
      member.user.id,
    );
    expect(added.warnings).toEqual([]);
    expect(await budgetAlertForViewer({ userId: member.user.id, projectId: project.id, at })).toBeNull();
    expect(await budgetAlertForViewer({ userId: owner.user.id, projectId: project.id, at })).toBe(costWarning);
    const started = await startTimer({
      projectId: project.id,
      note: "",
      now: at,
      userId: member.user.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.warning).toBeNull();
  });

  it("returns nothing for a member on a project they have not tracked", async () => {
    const owner = await signInAs("owner", "alert-untracked-owner@ulix.test");
    const member = await signInAs("member", "alert-untracked-member@ulix.test");
    const project = await hoursProject(owner.user.id, "Someone else's hours");
    await trackedHours(project.id, owner.user.id);
    expect(await budgetAlertForViewer({ userId: member.user.id, projectId: project.id, at })).toBeNull();
    expect(await budgetAlertForViewer({ userId: owner.user.id, projectId: project.id, at })).toBe(hoursWarning);
  });

  it("does not let alertProject show a member a cost budget or a project they have not tracked", async () => {
    const owner = await signInAs("owner", "alert-override-owner@ulix.test");
    const member = await signInAs("member", "alert-override-member@ulix.test");
    const costClient = await prisma.client.create({ data: { name: "Override Client", currency: "USD" } });
    const costProject = await createProject({
      name: "Override cost",
      description: null,
      clientId: costClient.id,
      billable: true,
    });
    await prisma.billRate.create({
      data: {
        scope: "client",
        clientId: costClient.id,
        amountMinor: 10_000,
        currency: "USD",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.user.id,
      },
    });
    expect(
      (
        await saveBudget({
          actorRole: owner.user.role,
          actorId: owner.user.id,
          scope: "project",
          projectId: costProject.id,
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
    await createManualEntry(
      {
        projectId: costProject.id,
        startedAt: new Date("2026-10-15T03:00:00.000Z"),
        endedAt: new Date("2026-10-15T03:54:00.000Z"),
        billable: true,
        note: "",
      },
      at,
      member.user.id,
    );
    const other = await hoursProject(owner.user.id, "Override other");
    await trackedHours(other.id, owner.user.id);

    const costFromQuery = await budgetAlertForViewer({
      userId: member.user.id,
      projectId: costProject.id,
      at,
    });
    const otherFromQuery = await budgetAlertForViewer({
      userId: member.user.id,
      projectId: other.id,
      at,
    });
    expect(costFromQuery).toBeNull();
    expect(otherFromQuery).toBeNull();
    expect(JSON.stringify([costFromQuery, otherFromQuery])).not.toMatch(/%|alert at|budget/i);
  });

  it("shows cost and untracked alerts to an owner and an admin", async () => {
    const owner = await signInAs("owner", "alert-manager-owner@ulix.test");
    const admin = await signInAs("admin", "alert-manager-admin@ulix.test");
    const client = await prisma.client.create({ data: { name: "Manager Client", currency: "USD" } });
    const costProject = await createProject({
      name: "Manager cost",
      description: null,
      clientId: client.id,
      billable: true,
    });
    await prisma.billRate.create({
      data: {
        scope: "client",
        clientId: client.id,
        amountMinor: 10_000,
        currency: "USD",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.user.id,
      },
    });
    expect(
      (
        await saveBudget({
          actorRole: owner.user.role,
          actorId: owner.user.id,
          scope: "project",
          projectId: costProject.id,
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
    await createManualEntry(
      {
        projectId: costProject.id,
        startedAt: new Date("2026-10-15T04:00:00.000Z"),
        endedAt: new Date("2026-10-15T04:54:00.000Z"),
        billable: true,
        note: "",
      },
      at,
      owner.user.id,
    );
    const hours = await hoursProject(owner.user.id, "Manager hours");
    await trackedHours(hours.id, owner.user.id);

    expect(await budgetAlertForViewer({ userId: owner.user.id, projectId: costProject.id, at })).toBe(
      costWarning,
    );
    expect(await budgetAlertForViewer({ userId: admin.user.id, projectId: costProject.id, at })).toBe(
      costWarning,
    );
    expect(await budgetAlertForViewer({ userId: admin.user.id, projectId: hours.id, at })).toBe(hoursWarning);
  });
});
