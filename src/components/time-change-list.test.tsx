/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { describeTimeChange, timeChangeSnapshot } from "@/lib/time-change-display";
import { timeChangeCopy } from "@/lib/time-change-copy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { TimeChangeList } from "@/components/time-change-list";

describe("manual time edits list", () => {
  it("shows before and after and marks an edit for someone else", async () => {
    const item = describeTimeChange({
      id: "c1",
      timeEntryId: "e1",
      action: "edited",
      source: "web",
      changedAt: new Date("2026-10-15T08:00:00.000Z"),
      timeZone: "Asia/Colombo",
      actorId: "jane",
      actorName: "Jane",
      entryUserId: "sam",
      entryUserName: "Sam",
      before: timeChangeSnapshot(
        {
          startedAt: new Date("2026-10-15T03:30:00.000Z"),
          endedAt: new Date("2026-10-15T04:30:00.000Z"),
          projectId: "p1",
          billable: true,
          note: "Draft",
        },
        "c1",
      ),
      after: timeChangeSnapshot(
        {
          startedAt: new Date("2026-10-15T04:00:00.000Z"),
          endedAt: new Date("2026-10-15T05:00:00.000Z"),
          projectId: "p1",
          billable: false,
          note: "Called the client",
        },
        "c1",
      ),
      projectNames: new Map([["p1", "Website"]]),
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(TimeChangeList, {
          items: [item],
          total: 1,
          page: 1,
          pageSize: 50,
          pageCount: 1,
          filtered: false,
          href: { from: "2026-10-12", to: "2026-10-18", memberId: "", clientId: "", projectId: "", action: "" },
        }),
      );
    });

    expect(container.textContent).toContain("Edited by Jane for Sam");
    expect(container.querySelector("[data-edited-for-other='true']")).not.toBeNull();
    expect(container.textContent).toContain("Draft");
    expect(container.textContent).toContain("Called the client");
    expect(container.textContent).toContain("→");
    expect(container.textContent).toContain(timeChangeCopy.sourceWeb);
    expect(container.textContent).not.toMatch(/USD|LKR|JPY|amountMinor/);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
