const EXTENSION_PROTOCOL = "chrome-extension:";

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

/** CORS headers for a chrome-extension origin. Empty when the origin is anything else. */
export function extensionCorsHeaders(request: { headers: { get(name: string): string | null } }) {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (!origin || !isChromeExtensionOrigin(origin)) return headers;
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
