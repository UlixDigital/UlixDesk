import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { installGuideText } from "../../src/lib/extension-install-guide.mjs";
import { buildExtension } from "../build.mjs";
import { zipEntries } from "../zip.mjs";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("extension zip", () => {
  it("stamps the manifest and packs INSTALL.txt from the install guide", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-ext-"));
    tempDirs.push(tmp);
    const builtAt = new Date("2026-10-22T08:13:00.000Z");
    const result = await buildExtension({
      dist: path.join(tmp, "dist"),
      zipPath: path.join(tmp, "ulixdesk-extension.zip"),
      metaPath: path.join(tmp, "extension-build.json"),
      builtAt,
      identity: { buildNumber: 42, commit: "abc1234def567890" },
      packageVersion: "0.1.0",
    });

    expect(result.meta).toEqual({
      version: "0.1.0.42",
      versionName: "0.1.0.42 (abc1234)",
      commit: "abc1234def567890",
      builtAt: "2026-10-22T08:13:00.000Z",
    });

    const source = JSON.parse(await readFile(path.resolve("extension/manifest.json"), "utf8"));
    expect(source.version).toBe("0.1.0");
    expect(source.version_name).toBeUndefined();

    const manifest = JSON.parse(await readFile(path.join(result.dist, "manifest.json"), "utf8"));
    expect(manifest.version).toBe("0.1.0.42");
    expect(manifest.version_name).toBe("0.1.0.42 (abc1234)");
    expect(manifest.key).toBe(source.key);

    const zip = await readFile(result.zipPath);
    const entries = zipEntries(zip);
    const install = entries.find((entry) => entry.name === "INSTALL.txt");
    expect(install?.data.toString("utf8")).toBe(installGuideText());
    const packedManifest = entries.find((entry) => entry.name === "manifest.json");
    expect(JSON.parse(packedManifest?.data.toString("utf8") ?? "{}").version).toBe("0.1.0.42");
  }, 60_000);
});
