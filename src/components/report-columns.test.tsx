/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { ReportColumns } from "@/components/report-columns";

describe("report column chips", () => {
  it("sets aria-pressed on the selected columns", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    let root: Root;
    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(ReportColumns, {
          kind: "time-activity",
          baseHref: "/reports/time-activity",
          columns: ["hours"],
          columnsInUrl: true,
          choices: ["hours", "billableHours"],
        }),
      );
    });
    const chips = [...container.querySelectorAll("a")];
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    await act(async () => {
      root!.unmount();
    });
    container.remove();
  });
});
