export const PRODUCTION_ORIGIN = "https://desk.ulixdigital.com";
export const STAGING_ORIGIN = "https://staging.desk.ulixdigital.com";

export type ServerPreset = "production" | "staging" | "custom";

export function presetForOrigin(origin: string): ServerPreset {
  if (origin === PRODUCTION_ORIGIN) return "production";
  if (origin === STAGING_ORIGIN) return "staging";
  return "custom";
}

export function originForPreset(preset: ServerPreset, customUrl: string) {
  if (preset === "production") return PRODUCTION_ORIGIN;
  if (preset === "staging") return STAGING_ORIGIN;
  return customUrl.trim();
}

export type ServerUrlResult =
  | { ok: true; origin: string }
  | { ok: false; reason: "empty" | "invalid" };

/** Accept an http(s) origin. Paths, queries, and credentials are rejected. */
export function normalizeServerUrl(input: string): ServerUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid" };
  }
  if (url.username || url.password) return { ok: false, reason: "invalid" };
  if (url.pathname !== "/" && url.pathname !== "") return { ok: false, reason: "invalid" };
  if (url.search || url.hash) return { ok: false, reason: "invalid" };
  return { ok: true, origin: url.origin };
}

export function hostPermissionPattern(origin: string) {
  return `${origin}/*`;
}

export function isConfigured(settings: { serverUrl: string; token: string }) {
  return settings.serverUrl.trim() !== "" && settings.token.trim() !== "";
}
