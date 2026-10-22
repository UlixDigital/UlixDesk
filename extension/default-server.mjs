/** File written into the downloaded zip. The popup reads it when nothing is saved yet. */
export const DEFAULT_SERVER_FILE = "default-server.json";

/** An http(s) origin, or "" when the value has a path, query, or credentials. */
export function normalizeServerOrigin(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (url.pathname !== "/" && url.pathname !== "") return "";
  if (url.search || url.hash) return "";
  return url.origin;
}

export function defaultServerDocument(serverUrl) {
  return `${JSON.stringify({ serverUrl: normalizeServerOrigin(serverUrl) })}\n`;
}
