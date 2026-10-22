import { readFileSync } from "node:fs";
import { zipEntries } from "../extension/zip.mjs";

const origin = process.env.ULIXDESK_SMOKE_ORIGIN ?? "http://127.0.0.1:3000";
const cookie = process.env.ULIXDESK_SMOKE_COOKIE ?? "";
const zipPath = "/app/extension/ulixdesk-extension.zip";

if (!cookie) {
  console.error("ULIXDESK_SMOKE_COOKIE is missing.");
  process.exit(1);
}

const packed = readFileSync(zipPath);
if (packed.readUInt32LE(0) !== 0x04034b50) {
  console.error("Extension file is not a zip.");
  process.exit(1);
}
const listing = packed.toString("latin1");
if (!listing.includes("INSTALL.txt") || !listing.includes("manifest.json")) {
  console.error("Extension zip is missing INSTALL.txt or manifest.json.");
  process.exit(1);
}

const meta = JSON.parse(readFileSync("/app/extension/extension-build.json", "utf8"));
if (!/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){1,3}$/.test(meta.version)) {
  console.error(`Extension version is not a Chrome version: ${meta.version}`);
  process.exit(1);
}

const unsigned = await fetch(`${origin}/api/extension/download`, { redirect: "manual" });
if (![301, 302, 303, 307, 308, 401].includes(unsigned.status)) {
  console.error(`Unsigned download returned ${unsigned.status}.`);
  process.exit(1);
}
if (unsigned.status !== 401) {
  const location = unsigned.headers.get("location") ?? "";
  if (!location.includes("/login")) {
    console.error(`Unsigned download redirected to ${location || "(nowhere)"}.`);
    process.exit(1);
  }
}

const signed = await fetch(`${origin}/api/extension/download`, {
  redirect: "manual",
  headers: { cookie: `ulixdesk_session=${cookie}` },
});
if (signed.status !== 200) {
  console.error(`Signed download returned ${signed.status}.`);
  process.exit(1);
}
const type = signed.headers.get("content-type") ?? "";
if (!type.includes("application/zip")) {
  console.error(`Signed download content-type was ${type}.`);
  process.exit(1);
}
const body = Buffer.from(await signed.arrayBuffer());
if (body.readUInt32LE(0) !== 0x04034b50) {
  console.error("Signed download was not a zip.");
  process.exit(1);
}
const entries = zipEntries(body);
for (const name of ["INSTALL.txt", "manifest.json", "default-server.json"]) {
  if (!entries.some((entry) => entry.name === name)) {
    console.error(`Signed download is missing ${name}.`);
    process.exit(1);
  }
}
const baked = JSON.parse(entries.find((entry) => entry.name === "default-server.json").data.toString("utf8"));
const expectedServer = process.env.ULIXDESK_PUBLIC_ORIGIN
  ? new URL(process.env.ULIXDESK_PUBLIC_ORIGIN).origin
  : new URL(origin).origin;
if (baked.serverUrl !== expectedServer) {
  console.error(`Signed download server URL was ${baked.serverUrl}, expected ${expectedServer}.`);
  process.exit(1);
}

const version = await fetch(`${origin}/api/extension/version`, { redirect: "manual" });
if (version.status !== 200) {
  console.error(`Version route returned ${version.status}.`);
  process.exit(1);
}
const published = await version.json();
if (published.version !== meta.version || published.builtAt !== meta.builtAt) {
  console.error("Version route does not match extension-build.json.");
  process.exit(1);
}
console.log(`Extension download ok ${meta.version} (${body.length} bytes).`);
