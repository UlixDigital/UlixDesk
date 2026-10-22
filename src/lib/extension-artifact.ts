import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type ExtensionBuildInfo = {
  version: string;
  versionName: string;
  commit: string;
  builtAt: string;
};

const CHROME_PART = /^(?:0|[1-9]\d*)$/;
const CHROME_PART_MAX = 65535;

export function isChromeVersion(value: string) {
  const parts = value.trim().split(".");
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => {
    if (!CHROME_PART.test(part)) return false;
    return Number(part) <= CHROME_PART_MAX;
  });
}

export function extensionZipPath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const override = env.ULIXDESK_EXTENSION_ZIP?.trim();
  if (override) return override;
  return path.join(cwd, "extension", "ulixdesk-extension.zip");
}

export function extensionBuildPath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const override = env.ULIXDESK_EXTENSION_BUILD?.trim();
  if (override) return override;
  return path.join(cwd, "extension", "extension-build.json");
}

export function parseExtensionBuild(value: unknown): ExtensionBuildInfo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "string" || !isChromeVersion(record.version)) return null;
  if (typeof record.builtAt !== "string" || Number.isNaN(Date.parse(record.builtAt))) return null;
  const versionName = typeof record.versionName === "string" && record.versionName.trim()
    ? record.versionName
    : record.version;
  const commit = typeof record.commit === "string" ? record.commit : "";
  return { version: record.version, versionName, commit, builtAt: record.builtAt };
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

export async function readExtensionBuild(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<ExtensionBuildInfo | null> {
  let text: string;
  try {
    text = await readFile(extensionBuildPath(env, cwd), "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  try {
    return parseExtensionBuild(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function readExtensionZip(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<Buffer | null> {
  try {
    const bytes = await readFile(extensionZipPath(env, cwd));
    if (bytes.length < 22) return null;
    return bytes;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The card is shown as built only when both the metadata and the zip exist. */
export async function readExtensionRelease(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<ExtensionBuildInfo | null> {
  const build = await readExtensionBuild(env, cwd);
  if (!build) return null;
  try {
    const info = await stat(extensionZipPath(env, cwd));
    if (!info.isFile() || info.size < 22) return null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  return build;
}
