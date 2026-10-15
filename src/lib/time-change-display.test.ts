import { describe, expect, it } from "vitest";
import { rateCopy } from "@/lib/rate-copy";
import {
  describeTimeChange,
  timeChangeColumnsOmitMoney,
  timeChangeSideColumns,
  timeChangeSnapshot,
  type TimeChangeSnapshot,
} from "@/lib/time-change-display";
import { changeByline, timeChangeCopy, timeEditsHref } from "@/lib/time-change-copy";

const start = new Date("2026-10-15T03:30:00.000Z");
const end = new Date("2026-10-15T04:30:00.000Z");

function snap(overrides: Partial<TimeChangeSnapshot> = {}): TimeChangeSnapshot {
  return timeChangeSnapshot(
    {
      startedAt: start,
      endedAt: end,
      projectId: "project-1",
      billable: true,
      note: "Called the client",
      ...overrides,
    },
    "client-1",
  );
}

const names = new Map([["project-1", "Website"], ["project-2", "Brochure"]]);

describe("time change display", () => {
  it("stores no money fields", () => {
    const columns = {
      ...timeChangeSideColumns("before", null),
      ...timeChangeSideColumns("after", snap()),
    };
    expect(timeChangeColumnsOmitMoney(columns)).toEqual([]);
    expect(snap()).not.toHaveProperty("amountMinor");
    expect(snap()).not.toHaveProperty("currency");
    expect(snap().durationMs).toBe(3_600_000);
  });

  it("shows an add as empty before values and filled after values", () => {
    const view = describeTimeChange({
      id: "c1",
      timeEntryId: "e1",
      action: "added",
      source: "web",
      changedAt: end,
      timeZone: "Asia/Colombo",
      actorId: "sam",
      actorName: "Sam",
      entryUserId: "sam",
      entryUserName: "Sam",
      before: null,
      after: snap(),
      projectNames: names,
      clientNames: new Map([["client-1", "Acme"]]),
    });
    expect(view.byline).toBe("Added by Sam");
    expect(view.forOther).toBe(false);
    expect(view.sourceLabel).toBe(timeChangeCopy.sourceWeb);
    const startField = view.fields.find((field) => field.label === timeChangeCopy.fieldStart);
    expect(startField?.before).toBe(timeChangeCopy.emptyValue);
    expect(startField?.after).toContain("9:00");
    expect(startField?.changed).toBe(true);
    expect(view.fields.find((field) => field.label === timeChangeCopy.fieldProject)?.after).toBe(
      "Website",
    );
    expect(view.fields.find((field) => field.label === timeChangeCopy.fieldClient)?.after).toBe(
      "Acme",
    );
    expect(view.fields.find((field) => field.label === timeChangeCopy.fieldBillable)?.after).toBe(
      rateCopy.billablePrefix,
    );
  });

  it("marks an edit made for someone else", () => {
    const before = snap();
    const after = snap({ startedAt: new Date("2026-10-15T04:00:00.000Z"), note: "Updated" });
    const view = describeTimeChange({
      id: "c2",
      timeEntryId: "e1",
      action: "edited",
      source: "web",
      changedAt: end,
      timeZone: "Asia/Colombo",
      actorId: "jane",
      actorName: "Jane",
      entryUserId: "sam",
      entryUserName: "Sam",
      before,
      after,
      projectNames: names,
      clientNames: new Map([["client-1", "Acme"]]),
    });
    expect(view.byline).toBe("Edited by Jane for Sam");
    expect(view.forOther).toBe(true);
    expect(changeByline({
      action: "deleted",
      actorId: "jane",
      actorName: "Jane",
      entryUserId: "sam",
      entryUserName: "Sam",
    })).toBe("Deleted by Jane for Sam");
    const notes = view.fields.find((field) => field.label === timeChangeCopy.fieldNotes);
    expect(notes?.changed).toBe(true);
    expect(notes?.before).toBe("Called the client");
    expect(notes?.after).toBe("Updated");
  });

  it("keeps a timer start open and a delete pointing at an empty after", () => {
    const running = timeChangeSnapshot(
      {
        startedAt: start,
        endedAt: null,
        projectId: "project-1",
        billable: false,
        note: null,
      },
      null,
    );
    const started = describeTimeChange({
      id: "c3",
      timeEntryId: "e2",
      action: "started",
      source: "extension",
      changedAt: start,
      timeZone: "UTC",
      actorId: "sam",
      actorName: "Sam",
      entryUserId: "sam",
      entryUserName: "Sam",
      before: null,
      after: running,
      projectNames: names,
      clientNames: new Map([["client-1", "Acme"]]),
    });
    expect(started.byline).toBe("Timer started by Sam");
    expect(started.sourceLabel).toBe(timeChangeCopy.sourceExtension);
    expect(started.fields.find((field) => field.label === timeChangeCopy.fieldEnd)?.changed).toBe(
      false,
    );
    expect(started.fields.find((field) => field.label === timeChangeCopy.fieldDuration)?.after).toBe(
      timeChangeCopy.emptyValue,
    );
    expect(
      started.fields.find((field) => field.label === timeChangeCopy.fieldBillable)?.after,
    ).toBe(rateCopy.nonBillable);

    const deleted = describeTimeChange({
      id: "c4",
      timeEntryId: "e1",
      action: "deleted",
      source: "api",
      changedAt: end,
      timeZone: "UTC",
      actorId: "sam",
      actorName: "Sam",
      entryUserId: "sam",
      entryUserName: "Sam",
      before: snap(),
      after: null,
      projectNames: names,
      clientNames: new Map([["client-1", "Acme"]]),
    });
    expect(deleted.sourceLabel).toBe("API");
    expect(deleted.fields.find((field) => field.label === timeChangeCopy.fieldProject)?.after).toBe(
      timeChangeCopy.emptyValue,
    );
  });

  it("builds a filter link and names a removed project", () => {
    expect(timeEditsHref({ from: "2026-10-12", action: "timer", page: 2 })).toBe(
      "/reports/manual-time-edits?from=2026-10-12&action=timer&page=2",
    );
    const view = describeTimeChange({
      id: "c5",
      timeEntryId: "e1",
      action: "edited",
      source: "web",
      changedAt: end,
      timeZone: "UTC",
      actorId: "sam",
      actorName: "Sam",
      entryUserId: "sam",
      entryUserName: "Sam",
      before: snap(),
      after: { ...snap(), projectId: "gone" },
      projectNames: names,
      clientNames: new Map([["client-1", "Acme"]]),
    });
    expect(view.fields.find((field) => field.label === timeChangeCopy.fieldProject)?.after).toBe(
      timeChangeCopy.removedProject,
    );
    expect(view.unchanged).toBe(false);
  });
});
