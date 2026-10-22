import { normalizeServerUrl, presetForOrigin, type ServerPreset } from "./server-url";

/** Same name as DEFAULT_SERVER_FILE in extension/default-server.mjs. */
export const DEFAULT_SERVER_FILE = "default-server.json";

export type AppliedServer = {
  serverUrl: string;
  serverPreset: ServerPreset;
  customUrl: string;
};

export function serverUrlFromDefaultConfig(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const serverUrl = (value as { serverUrl?: unknown }).serverUrl;
  if (typeof serverUrl !== "string") return "";
  const parsed = normalizeServerUrl(serverUrl);
  return parsed.ok ? parsed.origin : "";
}

/**
 * A saved server wins. With nothing saved, use the URL baked into the download.
 * An empty bake stays blank. It does not assume production.
 */
export function applyServerSelection(stored: string, baked: string): AppliedServer {
  const trimmed = stored.trim();
  if (!trimmed) return selection(serverUrlFromDefaultConfig({ serverUrl: baked }));
  const parsed = normalizeServerUrl(trimmed);
  if (!parsed.ok) return { serverUrl: trimmed, serverPreset: "custom", customUrl: trimmed };
  return selection(parsed.origin);
}

function selection(origin: string): AppliedServer {
  if (!origin) return { serverUrl: "", serverPreset: "custom", customUrl: "" };
  const serverPreset = presetForOrigin(origin);
  return {
    serverUrl: origin,
    serverPreset,
    customUrl: serverPreset === "custom" ? origin : "",
  };
}

export async function loadBakedServerUrl(): Promise<string> {
  try {
    const response = await fetch(chrome.runtime.getURL(DEFAULT_SERVER_FILE));
    if (!response.ok) return "";
    return serverUrlFromDefaultConfig(await response.json());
  } catch {
    return "";
  }
}
