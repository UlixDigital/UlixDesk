import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { timeCopy } from "@/lib/time-copy";
import {
  createManualEntry,
  getRunningTimer,
  hasOverlap,
  listEntriesOverlapping,
  startTimer,
  stopTimer,
  trackedMsForClient,
  trackedMsForProject,
  updateManualEntry,
} from "@/lib/time-entries";
import { buildDailyTimesheet, buildWeeklyTimesheet } from "@/lib/timesheet";
import { timerFailureMessage } from "@/lib/time-copy";

beforeEach(resetTestDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeProject(name: string, billable = true, clientName?: string) {
  const client = clientName
    ? await createClient({
        name: clientName,
        address: null,
        phone: null,
        emails: [],
      })
    : null;
  return createProject({
    name,
    description: null,
    clientId: client?.id ?? null,
    billable,
  });
}

describe("manual entries", () => {
  it("saves an overlapping entry and reports the warning", async () => {
    const project = await makeProject("Website");
    const now = new Date("2026-10-09T18:00:00.000Z");
    const first = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-09T15:00:00.000Z"),
        endedAt: new Date("2026-10-09T16:00:00.000Z"),
        billable: true,
        note: null,
      },
      now,
    );
    const second = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-09T15:30:00.000Z"),
        endedAt: new Date("2026-10-09T16:30:00.000Z"),
        billable: false,
        note: "Overlap",
      },
      now,
    );

    expect(first.overlap).toBe(false);
    expect(second.overlap).toBe(true);
    expect(await prisma.timeEntry.count()).toBe(2);
    expect(
      await hasOverlap({
        startedAt: new Date("2026-10-09T16:30:00.000Z"),
        endedAt: new Date("2026-10-09T17:00:00.000Z"),
        now,
      }),
    ).toBe(false);
  });

  it("does not treat the entry being edited as its own overlap", async () => {
    const project = await makeProject("Website", false);
    const now = new Date("2026-10-09T18:00:00.000Z");
    const created = await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-09T15:00:00.000Z"),
        endedAt: new Date("2026-10-09T16:00:00.000Z"),
        billable: false,
        note: null,
      },
      now,
    );
    const updated = await updateManualEntry(
      created.entry.id,
      {
        projectId: project.id,
        startedAt: new Date("2026-10-09T15:00:00.000Z"),
        endedAt: new Date("2026-10-09T16:15:00.000Z"),
        billable: true,
        note: "Edited",
      },
      now,
    );
    expect(updated?.overlap).toBe(false);
    expect(updated?.entry.billable).toBe(true);
    expect(updated?.entry.note).toBe("Edited");
    expect(updated?.entry.source).toBe("manual");
  });
});

describe("timers", () => {
  it("stores one running timer that is still there on the next read", async () => {
    const project = await makeProject("Website", false);
    const started = await startTimer({
      projectId: project.id,
      note: "Focus",
      now: new Date("2026-10-09T15:00:00.000Z"),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.timer.endedAt).toBeNull();
    expect(started.timer.billable).toBe(false);
    expect(started.timer.source).toBe("timer");
    expect(started.timer.userId).toBeNull();

    const again = await getRunningTimer();
    expect(again?.id).toBe(started.timer.id);
    expect(again?.project.name).toBe("Website");

    const second = await startTimer({
      projectId: project.id,
      note: "",
      now: new Date("2026-10-09T15:05:00.000Z"),
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(timerFailureMessage(second.code)).toBe(timeCopy.timerAlready);
    expect(await prisma.timeEntry.count({ where: { endedAt: null } })).toBe(1);
  });

  it("refuses a timer on an archived project and a stop before one second", async () => {
    const project = await makeProject("Website");
    await prisma.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date("2026-10-01T00:00:00.000Z") },
    });
    const inactive = await startTimer({
      projectId: project.id,
      note: "",
      now: new Date("2026-10-09T15:00:00.000Z"),
    });
    expect(inactive.ok).toBe(false);
    if (inactive.ok) return;
    expect(timerFailureMessage(inactive.code)).toBe(timeCopy.projectInactive);

    const missing = await startTimer({
      projectId: "missing-project",
      note: "",
      now: new Date("2026-10-09T15:00:00.000Z"),
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(timerFailureMessage(missing.code)).toBe(timeCopy.projectMissing);

    const active = await makeProject("Support");
    const started = await startTimer({
      projectId: active.id,
      note: "",
      now: new Date("2026-10-09T15:00:00.000Z"),
    });
    expect(started.ok).toBe(true);
    const tooSoon = await stopTimer(new Date("2026-10-09T15:00:00.500Z"));
    expect(tooSoon.ok).toBe(false);
    if (tooSoon.ok) return;
    expect(timerFailureMessage(tooSoon.code)).toBe(timeCopy.timerShort);
    expect((await getRunningTimer())?.id).toBe(
      started.ok ? started.timer.id : "",
    );
  });

  it("caps a timer that ran longer than 24 hours and keeps the rest", async () => {
    const project = await makeProject("Website");
    const startedAt = new Date("2026-10-08T12:00:00.000Z");
    await startTimer({ projectId: project.id, note: "", now: startedAt });
    const stopped = await stopTimer(new Date("2026-10-09T13:30:00.000Z"));
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.capped).toBe(true);
    expect(stopped.entry.endedAt?.toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect(stopped.entry.source).toBe("timer");
    expect(await getRunningTimer()).toBeNull();

    const exact = await startTimer({
      projectId: project.id,
      note: "",
      now: new Date("2026-10-10T12:00:00.000Z"),
    });
    expect(exact.ok).toBe(true);
    const onTheDot = await stopTimer(new Date("2026-10-11T12:00:00.000Z"));
    expect(onTheDot.ok).toBe(true);
    if (!onTheDot.ok) return;
    expect(onTheDot.capped).toBe(false);
  });

  it("lets only one of two concurrent stops save the entry", async () => {
    const project = await makeProject("Website");
    const started = await startTimer({
      projectId: project.id,
      note: "",
      now: new Date("2026-10-09T12:00:00.000Z"),
    });
    expect(started.ok).toBe(true);
    const now = new Date("2026-10-09T13:00:00.000Z");
    const [first, second] = await Promise.all([stopTimer(now), stopTimer(now)]);
    const results = [first, second];
    const saved = results.filter((result) => result.ok);
    const missed = results.filter((result) => !result.ok);
    expect(saved).toHaveLength(1);
    expect(missed).toHaveLength(1);
    if (missed[0]?.ok) return;
    expect(timerFailureMessage(missed[0].code)).toBe(timeCopy.timerNone);
    expect(await prisma.timeEntry.count({ where: { endedAt: { not: null } } })).toBe(1);
    expect(await prisma.runningTimer.count()).toBe(0);
    expect(await getRunningTimer()).toBeNull();
  });

  it("warns when a stopped timer overlaps another entry", async () => {
    const project = await makeProject("Website");
    const now = new Date("2026-10-09T18:00:00.000Z");
    await createManualEntry(
      {
        projectId: project.id,
        startedAt: new Date("2026-10-09T15:00:00.000Z"),
        endedAt: new Date("2026-10-09T16:00:00.000Z"),
        billable: true,
        note: null,
      },
      now,
    );
    await startTimer({
      projectId: project.id,
      note: "",
      now: new Date("2026-10-09T15:30:00.000Z"),
    });
    const stopped = await stopTimer(new Date("2026-10-09T16:30:00.000Z"));
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.overlap).toBe(true);
    expect(stopped.capped).toBe(false);
  });
});

describe("tracked totals", () => {
  it("sums completed time on the project and the client, and follows local days", async () => {
    const website = await makeProject("Website", true, "Acme");
    const other = await makeProject("Internal");
    const now = new Date("2026-10-10T18:00:00.000Z");
    await createManualEntry(
      {
        projectId: website.id,
        startedAt: new Date("2026-10-10T06:30:00.000Z"),
        endedAt: new Date("2026-10-10T07:30:00.000Z"),
        billable: true,
        note: null,
      },
      now,
    );
    await createManualEntry(
      {
        projectId: other.id,
        startedAt: new Date("2026-10-09T16:00:00.000Z"),
        endedAt: new Date("2026-10-09T17:00:00.000Z"),
        billable: true,
        note: null,
      },
      now,
    );
    await startTimer({
      projectId: website.id,
      note: "",
      now: new Date("2026-10-10T17:00:00.000Z"),
    });

    expect(await trackedMsForProject(website.id)).toBe(60 * 60 * 1000);
    expect(await trackedMsForClient(website.clientId!)).toBe(60 * 60 * 1000);
    expect(await trackedMsForProject(other.id)).toBe(60 * 60 * 1000);

    const rangeStart = new Date("2026-10-05T07:00:00.000Z");
    const rangeEnd = new Date("2026-10-12T07:00:00.000Z");
    const entries = await listEntriesOverlapping({ rangeStart, rangeEnd });
    const daily = buildDailyTimesheet({
      date: "2026-10-09",
      timeZone: "America/Los_Angeles",
      entries,
    });
    expect(daily.totalMs).toBe(90 * 60 * 1000);
    const weekly = buildWeeklyTimesheet({
      date: "2026-10-09",
      timeZone: "America/Los_Angeles",
      entries,
    });
    expect(weekly.totalMs).toBe(2 * 60 * 60 * 1000);
    expect(await getRunningTimer()).not.toBeNull();
  });
});
