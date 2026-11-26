/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DashboardPayload } from "@/lib/dashboard-format";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { DashboardView } from "@/components/dashboard-view";

const hour = 3_600_000;

function payload(workedTodayMs = 4 * hour): DashboardPayload {
  return {
    timeZone: "Asia/Colombo",
    generatedAt: new Date().toISOString(),
    weekLabel: "Mon, Oct 19, 2026 – Sun, Oct 25, 2026",
    sparklineDates: ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"],
    weekDates: ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
    summary: {
      workedTodayMs,
      workedTodayDeltaMs: -(15 * hour + 21 * 60 * 1000 + 2 * 1000),
      workedTodaySparkline: [0, hour, 0, 2 * hour, 0, 0, 4 * hour],
      projectsWorked: 2,
      projectsDelta: -1,
      projectsSparkline: [0, 1, 0, 1, 0, 0, 2],
      workedWeekMs: 14 * hour,
      workedWeekDeltaMs: 3 * hour,
      workedWeekSparkline: [0, hour, 0, 2 * hour, 0, 0, 4 * hour],
    },
    online: [
      {
        userId: "maya",
        name: "Maya Chen",
        initial: "M",
        working: true,
        projectName: "Website Coding",
        clientName: "Northwind",
        detail: "Homepage hero",
        todayMs: 2 * hour,
        weekMs: 8 * hour,
        weekBars: [0, 0, 0, 0, 2 * hour, 0, 0],
      },
      {
        userId: "jonah",
        name: "Jonah Ellis",
        initial: "J",
        working: false,
        projectName: "Design Mockups",
        clientName: "Brightpath",
        detail: "Logo exploration",
        todayMs: 0,
        weekMs: hour,
        weekBars: [hour, 0, 0, 0, 0, 0, 0],
      },
    ],
    projects: [
      { projectId: "website", projectName: "Website Coding", clientName: "Northwind", ms: 8 * hour },
      { projectId: "design", projectName: "Design Mockups", clientName: "Brightpath", ms: hour },
    ],
  };
}

async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("dashboard view", () => {
  it("shows the team summary without activity scores or money", async () => {
    const view = await render(createElement(DashboardView, { initial: payload() }));
    const text = view.container.textContent ?? "";
    expect(text).toContain("Worked today");
    expect(text).toContain("Projects worked");
    expect(text).toContain("This week");
    expect(text).toContain("Worked this week");
    expect(text).toContain("down 15:21:02 vs yesterday");
    expect(text).toContain("down 1 vs last week");
    expect(text).toContain("up 3:00:00 vs last week");
    expect(text).toContain("Who's online");
    expect(text).toContain("Working");
    expect(text).toContain("Not working");
    expect(text).toContain("Website Coding");
    expect(text).toContain("Northwind");
    expect(text).toContain("Homepage hero");
    expect(text).toContain("Current project activity");
    expect(text).toContain("Last updated just now");
    expect(view.container.querySelector("a[href='/reports']")?.textContent).toBe("View report");
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%/);
    expect(text).not.toMatch(/\b(idle|productivity|screenshot|organization)\b/i);
    expect(text).not.toMatch(/\$|\bUSD\b/);
    await view.unmount();
  });

  it("refreshes the numbers from the dashboard API", async () => {
    const next = payload(9 * hour);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ dashboard: next }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const view = await render(createElement(DashboardView, { initial: payload() }));
    expect(view.container.textContent).toContain("4:00:00");

    const button = [...view.container.querySelectorAll("button")].find((node) => node.textContent === "Refresh");
    await act(async () => {
      button?.click();
      await Promise.all(fetchMock.mock.results.map((result) => result.value));
    });

    const today = view.container.querySelector("article[aria-label='Worked today'] .text-2xl");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard", { headers: { accept: "application/json" } });
    expect(today?.textContent).toBe("9:00:00");
    await view.unmount();
    vi.unstubAllGlobals();
  });
});
