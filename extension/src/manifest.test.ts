import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { settingsFromStored } from "./storage";

const extensionRoot = path.resolve("extension");

function chromeExtensionId(key: string) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest();
  return Buffer.from(digest.subarray(0, 16))
    .toString("hex")
    .split("")
    .map((nibble) => String.fromCharCode(97 + Number.parseInt(nibble, 16)))
    .join("");
}

describe("extension manifest and storage", () => {
  it("requests host access only as an optional permission, never all urls", () => {
    const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(chromeExtensionId(manifest.key)).toBe("cjlaoflbipaehclleojofopapalhiooe");
  });

  it("reads settings from local storage values and never sync storage or logs", () => {
    expect(
      settingsFromStored({
        serverUrl: "http://127.0.0.1:3000",
        token: "ulixdesk_secret",
        lastProjectId: "website",
        ignored: 1,
      }),
    ).toEqual({
      serverUrl: "http://127.0.0.1:3000",
      token: "ulixdesk_secret",
      lastProjectId: "website",
    });
    expect(settingsFromStored({})).toEqual({ serverUrl: "", token: "", lastProjectId: "" });

    const sources = readdirSync(path.join(extensionRoot, "src")).filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
    );
    for (const file of sources) {
      const source = readFileSync(path.join(extensionRoot, "src", file), "utf8");
      expect(source, file).not.toContain("storage.sync");
      expect(source, file).not.toContain("console.");
    }
    const background = readFileSync(path.join(extensionRoot, "src", "background.ts"), "utf8");
    expect(background).toContain("chrome.alarms");
    expect(background).toContain('area === "local"');
    const storage = readFileSync(path.join(extensionRoot, "src", "storage.ts"), "utf8");
    expect(storage).toContain("chrome.storage.local");
    expect(storage).not.toContain("chrome.storage.sync");
  });
});
