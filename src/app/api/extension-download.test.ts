import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipDirectory, zipEntries } from "../../../extension/zip.mjs";
import { GET as downloadExtension } from "@/app/api/extension/download/route";
import { GET as extensionVersion, OPTIONS as extensionVersionOptions } from "@/app/api/extension/version/route";
import { apiCodes } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { prisma } from "@/lib/db";
import { clearExtensionDownloadCache } from "@/lib/extension-download-zip";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { SESSION_COOKIE, signSessionCookie } from "@/lib/session-cookie";
import { signInAs } from "@/lib/test-actor";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const STAGING_ORIGIN = "https://staging.desk.ulixdigital.com";
const PRODUCTION_ORIGIN = "https://desk.ulixdigital.com";
const dirs: string[] = [];
const savedOrigin = process.env.ULIXDESK_PUBLIC_ORIGIN;

beforeEach(async () => {
  await resetTestDatabase();
  clearExtensionDownloadCache();
  const dir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-extension-missing-"));
  dirs.push(dir);
  process.env.ULIXDESK_EXTENSION_ZIP = path.join(dir, "missing-ulixdesk-extension.zip");
  process.env.ULIXDESK_EXTENSION_BUILD = path.join(dir, "missing-extension-build.json");
  delete process.env.ULIXDESK_PUBLIC_ORIGIN;
});

afterEach(async () => {
  delete process.env.ULIXDESK_EXTENSION_ZIP;
  delete process.env.ULIXDESK_EXTENSION_BUILD;
  if (savedOrigin === undefined) delete process.env.ULIXDESK_PUBLIC_ORIGIN;
  else process.env.ULIXDESK_PUBLIC_ORIGIN = savedOrigin;
  clearExtensionDownloadCache();
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

async function writeBaseZip() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ulixdesk-download-"));
  dirs.push(dir);
  const source = path.join(dir, "src");
  await mkdir(source);
  await writeFile(path.join(source, "manifest.json"), "{}\n");
  await writeFile(path.join(source, "INSTALL.txt"), "install\n");
  await writeFile(path.join(source, "default-server.json"), '{"serverUrl":""}\n');
  const zipPath = path.join(dir, "ulixdesk-extension.zip");
  await writeFile(zipPath, zipDirectory(source, new Date("2026-10-22T08:13:00.000Z")));
  process.env.ULIXDESK_EXTENSION_ZIP = zipPath;
  return zipPath;
}

function bakedServerUrl(bytes: Buffer) {
  const entry = zipEntries(bytes).find((item) => item.name === "default-server.json");
  expect(entry).toBeTruthy();
  return JSON.parse(entry?.data.toString("utf8") ?? "{}").serverUrl as string;
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

    await writeBaseZip();

    const response = await downloadExtension(downloadRequest(member.cookie));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/zip");
    expect(response.headers.get("content-disposition")).toContain("ulixdesk-extension.zip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-length")).toBe(String(body.length));
    expect(bakedServerUrl(body)).toBe("http://127.0.0.1:3000");
    expect(zipEntries(body).some((entry) => entry.name === "INSTALL.txt")).toBe(true);

    const admin = await signInAs("admin", "extension-admin@ulix.test");
    const adminResponse = await downloadExtension(downloadRequest(admin.cookie));
    expect(adminResponse.status).toBe(200);
    expect(Buffer.from(await adminResponse.arrayBuffer())).toEqual(body);
  });

  it("bakes the staging and production public origins into the zip", async () => {
    const member = await signInAs("member", "extension-origin@ulix.test");
    const zipPath = await writeBaseZip();

    process.env.ULIXDESK_PUBLIC_ORIGIN = `${STAGING_ORIGIN}/`;
    const stagingResponse = await downloadExtension(downloadRequest(member.cookie, "evil.test"));
    expect(stagingResponse.status).toBe(403);

    const staging = await downloadExtension(downloadRequest(member.cookie));
    expect(staging.status).toBe(200);
    const stagingZip = Buffer.from(await staging.arrayBuffer());
    expect(bakedServerUrl(stagingZip)).toBe(STAGING_ORIGIN);
    expect(bakedServerUrl(stagingZip)).not.toBe(PRODUCTION_ORIGIN);

    process.env.ULIXDESK_PUBLIC_ORIGIN = PRODUCTION_ORIGIN;
    const production = await downloadExtension(downloadRequest(member.cookie));
    expect(production.status).toBe(200);
    const productionZip = Buffer.from(await production.arrayBuffer());
    expect(bakedServerUrl(productionZip)).toBe(PRODUCTION_ORIGIN);
    expect(bakedServerUrl(productionZip)).not.toBe(STAGING_ORIGIN);
    expect(productionZip.equals(stagingZip)).toBe(false);

    const again = await downloadExtension(downloadRequest(member.cookie));
    expect(Buffer.from(await again.arrayBuffer())).toEqual(productionZip);

    const source = path.join(path.dirname(zipPath), "src");
    await writeFile(path.join(source, "extra.txt"), "fresh\n");
    await writeFile(zipPath, zipDirectory(source, new Date("2026-10-22T09:00:00.000Z")));
    const fresh = await downloadExtension(downloadRequest(member.cookie));
    const freshZip = Buffer.from(await fresh.arrayBuffer());
    expect(freshZip.equals(productionZip)).toBe(false);
    expect(zipEntries(freshZip).some((entry) => entry.name === "extra.txt")).toBe(true);
    expect(bakedServerUrl(freshZip)).toBe(PRODUCTION_ORIGIN);
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
