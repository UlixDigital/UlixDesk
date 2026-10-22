/**
 * Chrome manifest versions are 1 to 4 dot-separated integers, each 0–65535.
 * UlixDesk uses the package version (major.minor.patch) plus one build number:
 *   0.1.0 + build 42 → 0.1.0.42
 * The build number is ULIXDESK_BUILD_NUMBER, then GITHUB_RUN_NUMBER, then
 * `git rev-list --count HEAD`, then 0. version_name carries the commit SHA.
 */

import { execSync } from "node:child_process";

export const CHROME_PART_MAX = 65535;

export function parsePackageVersion(version) {
  const parts = String(version).trim().split(".");
  if (parts.length < 1 || parts.length > 3) {
    throw new Error(`Package version must be 1 to 3 integers, got ${version}.`);
  }
  return parts.map((part) => parsePart(part, version));
}

function parsePart(part, source) {
  if (!/^(0|[1-9]\d*)$/.test(part)) {
    throw new Error(`Version part is not an integer: ${source}.`);
  }
  const value = Number(part);
  if (value > CHROME_PART_MAX) {
    throw new Error(`Version part is above ${CHROME_PART_MAX}: ${source}.`);
  }
  return value;
}

/** A missing or non-numeric build becomes 0. Values above 65535 are clamped. */
export function clampBuildNumber(value) {
  if (value === undefined || value === null) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  if (!/^(0|[1-9]\d*)$/.test(text)) return 0;
  return Math.min(Number(text), CHROME_PART_MAX);
}

export function chromeVersion({ packageVersion, buildNumber }) {
  const parts = [...parsePackageVersion(packageVersion), clampBuildNumber(buildNumber)];
  if (parts.length > 4) {
    throw new Error("Chrome version has more than 4 parts.");
  }
  return parts.join(".");
}

export function isChromeVersion(value) {
  const text = String(value).trim();
  const parts = text.split(".");
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => {
    if (!/^(0|[1-9]\d*)$/.test(part)) return false;
    return Number(part) <= CHROME_PART_MAX;
  });
}

export function versionName(version, commit) {
  const sha = String(commit ?? "").trim();
  if (!sha) return version;
  return `${version} (${sha.slice(0, 7)})`;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function gitValue(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/**
 * Identity for one extension build. Env wins so Docker can stamp a commit
 * without a .git directory. Git is the local fallback.
 */
export function readBuildIdentity(env = process.env) {
  const commit =
    firstNonEmpty([env.ULIXDESK_COMMIT, env.GITHUB_SHA]) || gitValue("git rev-parse HEAD");
  const rawBuild =
    firstNonEmpty([env.ULIXDESK_BUILD_NUMBER, env.GITHUB_RUN_NUMBER]) ||
    gitValue("git rev-list --count HEAD");
  return {
    commit,
    buildNumber: clampBuildNumber(rawBuild),
  };
}

export function stampManifest(manifest, { packageVersion, buildNumber, commit }) {
  const version = chromeVersion({ packageVersion, buildNumber });
  return {
    ...manifest,
    version,
    version_name: versionName(version, commit),
  };
}
