/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => "/clients",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/app/login/actions", () => ({
  logoutAction: vi.fn(),
}));

import { AppSidebar } from "@/components/app-sidebar";

describe("mobile menu", () => {
  it("closes when you click outside it", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(createElement(AppSidebar, { name: "Ada", role: "Owner", showTeam: true }));
    });

    const menu = document.querySelector("button[aria-expanded]") as HTMLButtonElement;
    const panel = document.getElementById(menu.getAttribute("aria-controls") ?? "");
    expect(panel?.className).toContain("hidden");

    await act(async () => {
      menu.click();
    });
    expect(panel?.className).not.toContain("hidden");

    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.append(outside);
    await act(async () => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(panel?.className).toContain("hidden");

    root.unmount();
    container.remove();
    outside.remove();
  });
});
