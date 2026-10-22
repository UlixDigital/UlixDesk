/** @vitest-environment happy-dom */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ExtensionInstallGuide } from "@/components/extension-install-guide";
import { extensionInstallGuide, installGuideText } from "@/lib/extension-install-guide.mjs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const required = [
  "Deleting the folder removes the extension.",
  "chrome://extensions",
  "Developer mode",
  "Load unpacked",
  "pin UlixDesk Timer",
  "your email, and your password",
  "replace the folder",
  "Reload",
  "manifest.json",
  "parent folder that only contains the zip",
  "server URL is wrong",
];

describe("extension install guide", () => {
  it("renders the steps, update, and troubleshooting from the shared source", async () => {
    const text = installGuideText();
    for (const phrase of required) {
      expect(text).toContain(phrase);
    }
    for (const step of extensionInstallGuide.steps) expect(text).toContain(step.body);
    expect(text).toContain(extensionInstallGuide.update.body);
    for (const item of extensionInstallGuide.troubleshooting) expect(text).toContain(item.body);
    expect(text.endsWith("\n")).toBe(true);

    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    const { act } = await import("react");
    await act(async () => {
      root.render(createElement(ExtensionInstallGuide));
    });

    expect(container.querySelector("h1")?.textContent).toBe(extensionInstallGuide.title);
    for (const phrase of required) {
      expect(container.textContent).toContain(phrase);
    }
    expect(container.querySelectorAll("svg[role='img']").length).toBe(
      extensionInstallGuide.steps.length + 1 + extensionInstallGuide.troubleshooting.length,
    );
    expect(container.querySelector("h2")?.textContent).toContain("Download and unzip");
    expect(container.textContent).toContain("Troubleshooting");

    root.unmount();
    container.remove();
  });
});
