import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as downloadExtension } from "@/app/api/extension/download/route";
import { GET as extensionVersion, OPTIONS as extensionVersionOptions } from "@/app/api/extension/version/route";
import { apiCodes } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { SESSION_COOKIE, signSessionCookie } from "@/lib/session-cookie";
import { signInAs } from "@/lib/test-actor";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const dirs: string[] = [];

beforeEach(async () => {
  await resetTestDatabase();
  delete process.env.ULIXDESK_EXTENSION_ZIP;
  delete process.env.ULIXDESK_EXTENSION_BUILD;
});

afterEach(async () => {
  delete process.env.ULIXDESK_EXTENSION_ZIP;
  delete process.env.ULIXDESK_EXTENSION_BUILD;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

afterAll(async () => {
  await prisma.$disconnect();
});

function downloadRequest(cookie?: string, host = "127.0.0.1:3000") {
  const headers = new Headers({ host });
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new Request("http://127.0.0.1:3000/api/extension/download", { headers });
}

describe("extension download", () => {
  it("requires a signed-in session and serves the zip to a member", async () => {
    const anonymous = await downloadExtension(downloadRequest());
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: authCopy.apiAuthRequired,
      code: apiCodes.AUTH_REQUIRED,
    });

    const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
    const forged = await signSessionCookie("missing-session-token", secret);
    const unknown = await downloadExtension(downloadRequest(forged));
    expect(unknown.status).toBe(401);

    const foreign = await downloadExtension(downloadRequest(undefined, "evil.test"));
    expect(foreign.status).toBe(403);

    const member = await signInAs("member", "extension-member@ulix.test");
    const missing = await downloadExtension(downloadRequest(member.cookie));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "The Chrome extension download isn't built yet.",
      code: apiCodes.EXTENSION_NOT_BUILT,
    });

    const dir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-download-"));
    dirs.push(dir);
    const bytes = Buffer.from("PK\u0003\u0004ulixdesk-extension-fixture");
    const zipPath = path.join(dir, "ulixdesk-extension.zip");
    await writeFile(zipPath, bytes);
    process.env.ULIXDESK_EXTENSION_ZIP = zipPath;

    const response = await downloadExtension(downloadRequest(member.cookie));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/zip");
    expect(response.headers.get("content-disposition")).toContain("ulixdesk-extension.zip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);

    const admin = await signInAs("admin", "extension-admin@ulix.test");
    const adminResponse = await downloadExtension(downloadRequest(admin.cookie));
    expect(adminResponse.status).toBe(200);
  });

  it("publishes the version and build date without a session", async () => {
    const absent = await extensionVersion(new Request("http://127.0.0.1:3000/api/extension/version"));
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({ available: false });

    const dir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-version-"));
    dirs.push(dir);
    const buildPath = path.join(dir, "extension-build.json");
    const build = {
      version: "0.1.0.9",
      versionName: "0.1.0.9 (abc1234)",
      commit: "abc1234def",
      builtAt: "2026-10-22T08:13:00.000Z",
    };
    await writeFile(buildPath, JSON.stringify(build));
    process.env.ULIXDESK_EXTENSION_BUILD = buildPath;

    const origin = `chrome-extension://${EXTENSION_ID}`;
    const response = await extensionVersion(
      new Request("http://127.0.0.1:3000/api/extension/version", { headers: { origin } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ available: true, ...build });

    const options = await extensionVersionOptions(
      new Request("http://127.0.0.1:3000/api/extension/version", { method: "OPTIONS", headers: { origin } }),
    );
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe(origin);
  });
});
