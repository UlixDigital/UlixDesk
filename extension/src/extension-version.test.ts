import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { popupCopy } from "./copy";
import { extensionUpdateNotice, isNewerChromeVersion } from "./extension-version";

describe("extension update notice", () => {
  it("shows a notice only when the server version is newer", () => {
    expect(isNewerChromeVersion("0.1.0.5", "0.1.0.4")).toBe(true);
    expect(isNewerChromeVersion("0.1.0.4", "0.1.0.4")).toBe(false);
    expect(isNewerChromeVersion("0.1.0.3", "0.1.0.4")).toBe(false);
    expect(isNewerChromeVersion("0.2.0", "0.1.0.9")).toBe(true);
    expect(isNewerChromeVersion("0.1.0", "0.1.0.0")).toBe(false);
    expect(isNewerChromeVersion("0.1.0.1", "0.1")).toBe(true);
    expect(isNewerChromeVersion("nope", "0.1.0")).toBe(false);
    expect(extensionUpdateNotice("0.1.0.8", "0.1.0.7")).toBe(popupCopy.newVersion);
    expect(extensionUpdateNotice("0.1.0.7", "0.1.0.7")).toBeNull();
    expect(extensionUpdateNotice(null, "0.1.0.7")).toBeNull();
    expect(popupCopy.newVersion.toLowerCase()).toContain("new version is available");
  });

  it("wires the notice into the popup for a signed-in session and the sign-in form", () => {
    const popup = readFileSync(path.resolve("extension/src/popup.ts"), "utf8");
    expect(popup).toContain("fetchExtensionVersion");
    expect(popup).toContain("extensionUpdateNotice");
    expect(popup).toContain("updateNotice");
    expect(popup).not.toContain("console.");
  });
});
