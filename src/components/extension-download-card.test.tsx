/** @vitest-environment happy-dom */
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { extensionCardCopy } from "@/lib/extension-install-guide.mjs";
import { formatTokenTimestamp } from "@/lib/token-copy";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { ExtensionDownloadCard } from "@/components/extension-download-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const { act } = await import("react");
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    unmount() {
      root.unmount();
      container.remove();
    },
  };
}

describe("Chrome extension card", () => {
  it("shows the version, build date, download, and install steps", async () => {
    const builtAt = "2026-10-22T08:13:00.000Z";
    const view = await render(
      createElement(ExtensionDownloadCard, {
        timeZone: "UTC",
        build: {
          version: "0.1.0.42",
          versionName: "0.1.0.42 (abc1234)",
          commit: "abc1234def",
          builtAt,
        },
      }),
    );
    const card = view.container.querySelector("#chrome-extension");
    expect(card?.textContent).toContain("Chrome extension");
    expect(card?.textContent).toContain("0.1.0.42");
    expect(card?.textContent).toContain("abc1234");
    expect(card?.textContent).toContain(formatTokenTimestamp(new Date(builtAt), "UTC"));
    expect(card?.querySelector("time")?.getAttribute("datetime")).toBe(builtAt);
    const download = card?.querySelector("a[href='/api/extension/download']");
    expect(download?.textContent).toBe(extensionCardCopy.download);
    for (const step of extensionCardCopy.steps) {
      expect(card?.textContent).toContain(step);
    }
    expect(card?.textContent).toContain(extensionCardCopy.updateNote);
    expect(card?.querySelector("a[href='/help/extension']")?.textContent).toBe(extensionCardCopy.guide);
    view.unmount();
  });

  it("says the download isn't built yet and hides the button", async () => {
    const view = await render(
      createElement(ExtensionDownloadCard, { timeZone: "UTC", build: null }),
    );
    const card = view.container.querySelector("#chrome-extension");
    expect(card?.textContent).toContain(extensionCardCopy.missing);
    expect(card?.textContent).toContain(extensionCardCopy.missingHint);
    expect(card?.querySelector("a[href='/api/extension/download']")).toBeNull();
    expect(card?.querySelector("a[href='/help/extension']")).not.toBeNull();
    view.unmount();
  });
});
