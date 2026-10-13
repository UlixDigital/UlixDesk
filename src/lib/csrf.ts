import { requestHeader, trustedForwardedHost, trustedForwardedProto } from "@/lib/request-headers";
import { testState } from "@/lib/test-hooks";
import { hostIsTrusted } from "@/lib/timer-api-guard";

function bareHost(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function sameLoopbackPort(originHost: string, requestHost: string) {
  let origin: URL;
  let host: URL;
  try {
    origin = new URL(`http://${originHost}`);
    host = new URL(`http://${requestHost}`);
  } catch {
    return false;
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!loopback.has(bareHost(origin.hostname).toLowerCase())) return false;
  if (!loopback.has(bareHost(host.hostname).toLowerCase())) return false;
  return origin.port === host.port;
}

/**
 * Server Actions are CSRF-safe for two independent reasons:
 * 1. The session cookie is SameSite=Lax, so browsers do not send it on a
 *    cross-site POST.
 * 2. This check requires the Origin host to match the Host (or
 *    X-Forwarded-Host) the app was reached on, and that host must be
 *    loopback or ULIXDESK_APP_HOSTS. Next.js also refuses an action whose
 *    Origin does not match the host before the action runs.
 * Caddy sets Host, X-Forwarded-Host, and X-Forwarded-Proto, plus a shared
 * secret header. Those forwarded headers are ignored unless the secret matches,
 * so another container on the Docker network cannot spoof them. The app and
 * Postgres publish no host ports.
 */
export async function originAllowed() {
  if (process.env.VITEST === "true" && !testState.headers) return true;

  const origin = await requestHeader("origin");
  const forwardedHost = await trustedForwardedHost();
  const host = forwardedHost || (await requestHeader("host"))?.trim() || "";
  const forwardedProto = await trustedForwardedProto();
  if (!origin || !host) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const originHost = originUrl.host.toLowerCase();
  const expectedHost = host.toLowerCase();
  if (originHost !== expectedHost && !sameLoopbackPort(originHost, expectedHost)) return false;
  if (forwardedProto === "https" && originUrl.protocol !== "https:") return false;
  if (forwardedProto === "http" && originUrl.protocol !== "http:") return false;
  return hostIsTrusted(host);
}
