import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isChromeVersion,
  parseExtensionBuild,
  readExtensionBuild,
  readExtensionRelease,
  readExtensionZip,
} from "@/lib/extension-artifact";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("extension artifact files", () => {
  it("accepts a Chrome version and a build file, and treats a missing zip as not built", async () => {
    expect(isChromeVersion("0.1.0.42")).toBe(true);
    expect(isChromeVersion("0.1.0.65536")).toBe(false);
    expect(parseExtensionBuild({ version: "0.1.0.4", builtAt: "2026-10-22T08:13:00.000Z" })).toEqual({
      version: "0.1.0.4",
      versionName: "0.1.0.4",
      commit: "",
      builtAt: "2026-10-22T08:13:00.000Z",
    });
    expect(parseExtensionBuild({ version: "beta", builtAt: "2026-10-22T08:13:00.000Z" })).toBeNull();

    const dir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-artifact-"));
    dirs.push(dir);
    const env = {
      ULIXDESK_EXTENSION_ZIP: path.join(dir, "missing.zip"),
      ULIXDESK_EXTENSION_BUILD: path.join(dir, "extension-build.json"),
    };
    expect(await readExtensionRelease(env)).toBeNull();
    expect(await readExtensionZip(env)).toBeNull();

    await writeFile(
      env.ULIXDESK_EXTENSION_BUILD,
      JSON.stringify({
        version: "0.1.0.4",
        versionName: "0.1.0.4 (abc1234)",
        commit: "abc1234",
        builtAt: "2026-10-22T08:13:00.000Z",
      }),
    );
    expect(await readExtensionBuild(env)).toMatchObject({ version: "0.1.0.4" });
    expect(await readExtensionRelease(env)).toBeNull();

    await writeFile(env.ULIXDESK_EXTENSION_ZIP, Buffer.from("not-a-real-zip-but-long-enough"));
    expect((await readExtensionRelease(env))?.version).toBe("0.1.0.4");
    await writeFile(env.ULIXDESK_EXTENSION_BUILD, "{");
    expect(await readExtensionBuild(env)).toBeNull();
  });
});
