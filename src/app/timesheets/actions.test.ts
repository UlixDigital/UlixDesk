import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  deleteTimeEntryAction,
  saveTimeEntryAction,
  startTimerAction,
} from "@/app/timesheets/actions";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { timeCopy } from "@/lib/time-copy";
import { getRunningTimer } from "@/lib/time-entries";
import {
  emptyTimeEntryFormValues,
  type TimeEntryFormState,
} from "@/lib/time-validation";

const initialState: TimeEntryFormState = {
  errors: {},
  values: emptyTimeEntryFormValues("UTC", "2026-10-09"),
};

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

beforeEach(resetTestDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("time entry actions", () => {
  it("rejects a blank project and an end time that is not after the start", async () => {
    const missing = await saveTimeEntryAction(
      initialState,
      form({
        projectId: "",
        date: "2026-01-15",
        startTime: "09:00",
        endTime: "10:00",
        billable: "true",
        timeZone: "UTC",
      }),
    );
    expect(missing.errors.projectId).toBe(timeCopy.projectRequired);

    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    const zero = await saveTimeEntryAction(
      initialState,
      form({
        projectId: project.id,
        date: "2026-01-15",
        startTime: "09:00",
        endTime: "09:00",
        billable: "true",
        timeZone: "UTC",
      }),
    );
    expect(zero.errors.endTime).toBe(timeCopy.endAfterStart);
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("saves a manual entry in the requested timezone and warns on overlap", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: false,
    });
    const fields = {
      projectId: project.id,
      date: "2026-01-15",
      startTime: "23:00",
      endTime: "23:30",
      billable: "true",
      note: "Late",
      timeZone: "America/Los_Angeles",
    };

    await expect(saveTimeEntryAction(initialState, form(fields))).rejects.toThrow(
      "REDIRECT:/timesheets?date=2026-01-15",
    );

    const saved = await prisma.timeEntry.findFirstOrThrow();
    expect(saved.startedAt.toISOString()).toBe("2026-01-16T07:00:00.000Z");
    expect(saved.billable).toBe(true);
    expect(saved.source).toBe("manual");

    await expect(
      saveTimeEntryAction(
        initialState,
        form({ ...fields, startTime: "23:15", endTime: "23:45" }),
      ),
    ).rejects.toThrow("REDIRECT:/timesheets?date=2026-01-15&notice=overlap");
  });

  it("refuses a new entry on an archived project", async () => {
    const project = await createProject({
      name: "Old",
      description: null,
      clientId: null,
      billable: true,
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date() },
    });
    const result = await saveTimeEntryAction(
      initialState,
      form({
        projectId: project.id,
        date: "2026-01-15",
        startTime: "09:00",
        endTime: "10:00",
        billable: "true",
        timeZone: "UTC",
      }),
    );
    expect(result.errors.projectId).toBe(timeCopy.projectInactive);
  });

  it("deletes a saved entry and leaves a running timer in place", async () => {
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });
    await expect(
      saveTimeEntryAction(
        initialState,
        form({
          projectId: project.id,
          date: "2026-01-15",
          startTime: "09:00",
          endTime: "10:00",
          billable: "true",
          timeZone: "UTC",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");
    const saved = await prisma.timeEntry.findFirstOrThrow();

    await expect(
      deleteTimeEntryAction(form({ id: saved.id, date: "2026-01-15" })),
    ).rejects.toThrow("REDIRECT:/timesheets?date=2026-01-15");
    expect(await prisma.timeEntry.count()).toBe(0);

    const started = await startTimerAction(
      { error: null, warnings: [] },
      form({ projectId: project.id }),
    );
    expect(started.error).toBeNull();
    const again = await startTimerAction(
      { error: null, warnings: [] },
      form({ projectId: project.id }),
    );
    expect(again.error).toBe(timeCopy.timerAlready);
    const running = await getRunningTimer();
    expect(running).not.toBeNull();
    await deleteTimeEntryAction(form({ id: running!.id, date: "2026-01-15" }));
    expect(await getRunningTimer()).not.toBeNull();
  });
});
