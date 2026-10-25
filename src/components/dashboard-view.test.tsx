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

vi.mock("@/components/shared-now", () => ({
  useSharedNow: (serverNow: number) => serverNow,
}));

import { DashboardView } from "@/components/dashboard-view";

const hour = 3_600_000;

function payload(overrides: Partial<DashboardPayload> = {}): DashboardPayload {
  return {
    scope: "all",
    canChooseScope: true,
    showMoney: true,
    timeZone: "Asia/Colombo",
    serverNow: Date.parse("2026-10-23T09:30:00.000Z"),
    runningTimers: 1,
    weekLabel: "Mon, Oct 19, 2026 - Sun, Oct 25, 2026",
    kpis: {
      workedTodayMs: 4 * hour,
      workedTodayDeltaMs: hour,
      workedWeekMs: 14 * hour,
      workedWeekDeltaMs: 13 * hour,
      todaySparkline: [0, 3, 4, 0, 3, 4, 0],
      weekSparkline: [3, 4, 0, 3, 4, 0, 0],
      online: 1,
      teamSize: 4,
      onlineDelta: 1,
      onlineSparkline: [1, 1, 0, 1, 2, 0, 0],
      projectsWorked: 3,
      projectsDelta: 2,
      projectsSparkline: [1, 1, 0, 1, 2, 0, 0],
    },
    online: [
      {
        userId: "maya",
        name: "Maya Chen",
        initial: "M",
        color: "#16a34a",
        projectName: "Website Coding",
        projectInitial: "W",
        projectColor: "#2563eb",
        todoTitle: "Homepage hero",
        startedAt: "2026-10-23T07:30:00.000Z",
        startedLabel: "1:00 PM",
      },
    ],
    workedToday: [
      {
        userId: "maya",
        name: "Maya Chen",
        initial: "M",
        color: "#16a34a",
        ms: 2 * hour,
        projectName: "Website Coding",
        projectInitial: "W",
        projectColor: "#2563eb",
        todoTitle: "Homepage hero",
        online: true,
      },
    ],
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
      date: `2026-10-${19 + index}`,
      label,
      ms: index === 4 ? 4 * hour : 0,
    })),
    projects: [
      {
        id: "website",
        name: "Website Coding",
        initial: "W",
        color: "#2563eb",
        ms: 5 * hour,
        sharePercent: 36,
        topTodo: "Homepage hero",
        todos: [{ id: "todo", title: "Homepage hero", ms: 5 * hour }],
      },
    ],
    team: [
      {
        userId: "maya",
        name: "Maya Chen",
        initial: "M",
        color: "#16a34a",
        todayMs: 2 * hour,
        weekMs: 5 * hour,
        running: true,
      },
    ],
    budgets: [
      {
        id: "budget",
        name: "Website Coding",
        initial: "W",
        color: "#2563eb",
        typeLabel: "Fixed",
        basis: "cost",
        spentLabel: "$300.00",
        budgetLabel: "$1,000.00",
        progressPercent: 30,
      },
    ],
    ...overrides,
  };
}

async function render(model: DashboardPayload) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(createElement(DashboardView, { initial: model }));
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("dashboard view", () => {
  it("shows the owner all-team widgets and the line graph", async () => {
    const view = await render(payload());
    expect(view.container.querySelector("h1")?.textContent).toBe("Dashboard");
    expect(view.container.textContent).toContain("Mon, Oct 19, 2026 - Sun, Oct 25, 2026");
    expect(view.container.querySelector("a[href='/dashboard?scope=all']")?.getAttribute("aria-current")).toBe("page");
    expect(view.container.textContent).toContain("Worked today");
    expect(view.container.textContent).toContain("4:00:00");
    expect(view.container.textContent).toContain("Worked this week");
    expect(view.container.textContent).toContain("14:00:00");
    expect(view.container.textContent).toContain("1 / 4 online");
    expect(view.container.textContent).toContain("Projects worked");
    expect(view.container.textContent).toContain("Maya Chen");
    expect(view.container.textContent).toContain("Website Coding");
    expect(view.container.textContent).toContain("Homepage hero");
    expect(view.container.textContent).toContain("2:00:00");
    expect(view.container.querySelector("[aria-label='Daily work total line graph']")).toBeTruthy();
    expect(view.container.textContent).toContain("4:00");
    expect(view.container.textContent).toContain("36%");
    expect(view.container.textContent).toContain("$300.00 of $1,000.00");
    expect(view.container.querySelector("a[href='/reports/time-activity']")?.textContent).toContain("View report");

    const bar = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Bar");
    await act(async () => {
      bar?.click();
    });
    expect(view.container.querySelector("[aria-label='Daily work total bar chart']")).toBeTruthy();
    const line = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Line");
    await act(async () => {
      line?.click();
    });
    expect(view.container.querySelector("[aria-label='Daily work total line graph']")).toBeTruthy();

    const todos = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Show to-dos");
    await act(async () => {
      todos?.click();
    });
    expect(view.container.textContent).toContain("Hide to-dos");
    view.unmount();
  });

  it("hides the team switch and money from a member", async () => {
    const view = await render(
      payload({
        scope: "me",
        canChooseScope: false,
        showMoney: false,
        kpis: {
          ...payload().kpis,
          online: 1,
          teamSize: 1,
        },
        budgets: [
          {
            id: "hours",
            name: "Design Mockups",
            initial: "D",
            color: "#ea580c",
            typeLabel: "Fixed",
            basis: "hours",
            spentLabel: "2:00:00",
            budgetLabel: "8:00:00",
            progressPercent: 25,
          },
        ],
      }),
    );
    expect(view.container.querySelector("a[href='/dashboard?scope=all']")).toBeNull();
    expect(view.container.textContent).toContain("1 / 1 online");
    expect(view.container.textContent).toContain("2:00:00 of 8:00:00");
    expect(view.container.textContent).not.toContain("$");
    expect(view.container.textContent).not.toContain("USD");
    view.unmount();
  });
});
