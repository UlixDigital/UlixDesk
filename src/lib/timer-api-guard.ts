import { timeCopy } from "@/lib/time-copy";

/**
 * Origins that may call the timer POST routes besides the app's own origin.
 * The Chrome extension slice should add its origin here, for example
 * "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef".
 * A comma-separated ULIXDESK_TIMER_ORIGINS value is included as well.
 */
export const TIMER_API_ORIGIN_ALLOWLIST: readonly string[] = [];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function timerOriginAllowlist() {
  const fromEnv = (process.env.ULIXDESK_TIMER_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...TIMER_API_ORIGIN_ALLOWLIST, ...fromEnv];
}

export function isAllowedTimerOrigin(
  origin: string,
  appOrigin: string | Iterable<string>,
) {
  const appOrigins = typeof appOrigin === "string" ? [appOrigin] : appOrigin;
  for (const candidate of appOrigins) {
    if (origin === candidate) return true;
  }
  return timerOriginAllowlist().includes(origin);
}

type HeaderSource = {
  url: string;
  headers: { get(name: string): string | null };
};

/**
 * Origins that count as this app for a timer POST.
 * `request.url` is not enough: Next can report localhost while the browser
 * called 127.0.0.1 (or the reverse) on the same port. The Host header is the
 * name the client used, and localhost, 127.0.0.1, and ::1 on that same port
 * are the same machine.
 */
export function appOriginsForRequest(request: HeaderSource) {
  const origins = new Set<string>();
  const page = new URL(request.url);
  addOrigin(origins, page.origin);
  const host = request.headers.get("host")?.trim();
  if (host) addOrigin(origins, originFromHost(page.protocol, host));
  return origins;
}

function addOrigin(origins: Set<string>, origin: string | null) {
  if (!origin) return;
  origins.add(origin);
  for (const alias of loopbackAliases(origin)) origins.add(alias);
}

function originFromHost(protocol: string, host: string) {
  try {
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

function loopbackAliases(origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return [];
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return [];
  const port = url.port ? `:${url.port}` : "";
  return ["localhost", "127.0.0.1", "[::1]"].map(
    (host) => `${url.protocol}//${host}${port}`,
  );
}

/** Reject a timer POST that is not JSON or that comes from another website. */
export function timerApiRefusal(request: HeaderSource): Response | null {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return Response.json({ error: timeCopy.jsonContentType }, { status: 415 });
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedTimerOrigin(origin, appOriginsForRequest(request))) {
    return Response.json({ error: timeCopy.originForbidden }, { status: 403 });
  }

  return null;
}
