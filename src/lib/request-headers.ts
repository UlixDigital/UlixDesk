import { headers } from "next/headers";
import { testState } from "@/lib/test-hooks";
import { PROXY_SECRET_HEADER, proxySecretMatches } from "@/lib/trusted-proxy";

export async function requestHeader(name: string) {
  if (process.env.VITEST === "true") {
    return testState.headers?.[name.toLowerCase()] ?? null;
  }
  const list = await headers();
  return list.get(name);
}

/** True only when Caddy presented the shared proxy secret. */
export async function requestFromTrustedProxy() {
  return proxySecretMatches(await requestHeader(PROXY_SECRET_HEADER));
}

/**
 * Client address for rate limits.
 * X-Forwarded-For is used only on a request that came through Caddy.
 * Everywhere else, including local dev, the key is the loopback address.
 */
export async function requestIp() {
  if (await requestFromTrustedProxy()) {
    const forwarded = await requestHeader("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return "127.0.0.1";
}

export async function trustedForwardedHost() {
  if (!(await requestFromTrustedProxy())) return null;
  return (await requestHeader("x-forwarded-host"))?.split(",")[0]?.trim() || null;
}

export async function trustedForwardedProto() {
  if (!(await requestFromTrustedProxy())) return null;
  return (await requestHeader("x-forwarded-proto"))?.split(",")[0]?.trim() || null;
}
