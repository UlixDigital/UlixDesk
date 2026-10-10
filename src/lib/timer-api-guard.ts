import { timeCopy } from "@/lib/time-copy";

/**
 * Origins that may call the timer routes without a bearer token, besides the
 * app's own origin. The Chrome extension authenticates with a token instead.
 * A comma-separated ULIXDESK_TIMER_ORIGINS value is included as well.
 */
export const TIMER_API_ORIGIN_ALLOWLIST: readonly string[] = [];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

type HeaderSource = {
  url: string;
  headers: { get(name: string): string | null };
};

export function timerOriginAllowlist() {
  const fromEnv = (process.env.ULIXDESK_TIMER_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...TIMER_API_ORIGIN_ALLOWLIST, ...fromEnv];
}

/**
 * Public hosts that count as this app, in addition to loopback.
 * A comma-separated list of host or host:port values, for example
 * "desk.example.com,staging.example.com:8443".
 * An arbitrary Host header is not trusted. That closes DNS rebinding:
 * a page can make Host and Origin both say evil.example while the request
 * lands on this server.
 */
export function configuredAppHosts() {
  return (process.env.ULIXDESK_APP_HOSTS ?? "")
    .split(",")
    .map((entry) => normalizeAllowlistHost(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeAllowlistHost(entry: string) {
  const trimmed = entry.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).host;
    } catch {
      return null;
    }
  }
  return trimmed;
}

export function isAllowedTimerOrigin(origin: string, appOrigin: string | Iterable<string>) {
  const appOrigins = typeof appOrigin === "string" ? [appOrigin] : appOrigin;
  for (const candidate of appOrigins) {
    if (origin === candidate) return true;
  }
  return timerOriginAllowlist().includes(origin);
}

/** Node reports the IPv6 hostname as "[::1]", not "::1". */
function bareHostname(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function hostnameFromHost(host: string) {
  const trimmed = host.trim();
  if (!trimmed) return null;
  try {
    return bareHostname(new URL(`http://${trimmed}`).hostname).toLowerCase();
  } catch {
    return null;
  }
}

export function hostIsTrusted(host: string | null | undefined) {
  if (!host) return false;
  const hostname = hostnameFromHost(host);
  if (!hostname) return false;
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  const header = host.trim().toLowerCase();
  return configuredAppHosts().some((entry) => entry === header || entry === hostname);
}

/**
 * Origins that count as this app for an unauthenticated timer call.
 * Only loopback and ULIXDESK_APP_HOSTS are trusted. The Host header is not
 * accepted just because it matches Origin.
 */
export function appOriginsForRequest(request: HeaderSource) {
  const origins = new Set<string>();
  const page = new URL(request.url);
  if (hostIsTrusted(page.host)) addOrigin(origins, page.origin);
  const host = request.headers.get("host")?.trim();
  if (host && hostIsTrusted(host)) addOrigin(origins, originFromHost(page.protocol, host));
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
  if (!LOOPBACK_HOSTS.has(bareHostname(url.hostname))) return [];
  const port = url.port ? `:${url.port}` : "";
  return ["localhost", "127.0.0.1", "[::1]"].map(
    (host) => `${url.protocol}//${host}${port}`,
  );
}

export function jsonContentTypeRefusal(request: HeaderSource): Response | null {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return Response.json({ error: timeCopy.jsonContentType }, { status: 415 });
  }
  return null;
}

/** Reject an unauthenticated call from an untrusted host or another website. */
export function unauthenticatedApiRefusal(request: HeaderSource): Response | null {
  const page = new URL(request.url);
  const hostHeader = request.headers.get("host")?.trim();
  const host = hostHeader || page.host;
  if (!hostIsTrusted(host)) {
    return Response.json({ error: timeCopy.hostForbidden }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedTimerOrigin(origin, appOriginsForRequest(request))) {
    return Response.json({ error: timeCopy.originForbidden }, { status: 403 });
  }

  return null;
}

/** Reject a timer POST that is not JSON or that comes from another website. */
export function timerApiRefusal(request: HeaderSource): Response | null {
  return jsonContentTypeRefusal(request) ?? unauthenticatedApiRefusal(request);
}
