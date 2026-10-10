const EXTENSION_PROTOCOL = "chrome-extension:";
const EXTENSION_ID = /^[a-p]{32}$/;

function envValue(name: string) {
  return process.env[name] ?? "";
}

/** Extension ids allowed to receive CORS headers. Comma-separated, letters a–p. */
export function configuredExtensionIds() {
  return envValue("ULIXDESK_EXTENSION_IDS")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => EXTENSION_ID.test(id));
}

export function isChromeExtensionOrigin(origin: string) {
  // chrome-extension is not a special URL scheme, so Node reports origin as "null".
  // The browser still sends the extension id as the host of the Origin header.
  try {
    const url = new URL(origin);
    return (
      url.protocol === EXTENSION_PROTOCOL &&
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function isAllowedExtensionOrigin(origin: string) {
  if (!isChromeExtensionOrigin(origin)) return false;
  let id: string;
  try {
    id = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return configuredExtensionIds().includes(id);
}

/** CORS headers for an allowlisted chrome-extension origin. Empty otherwise. */
export function extensionCorsHeaders(request: { headers: { get(name: string): string | null } }) {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedExtensionOrigin(origin)) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

export function withExtensionCors(request: { headers: { get(name: string): string | null } }, response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of extensionCorsHeaders(request)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
