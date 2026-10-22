import { normalizeServerOrigin } from "../../extension/default-server.mjs";
import { hostIsTrusted } from "@/lib/timer-api-guard";
import { PROXY_SECRET_HEADER, proxySecretMatches } from "@/lib/trusted-proxy";

type HeaderSource = {
  url: string;
  headers: { get(name: string): string | null };
};

/**
 * Origin to bake into a downloaded extension zip.
 * ULIXDESK_PUBLIC_ORIGIN wins, including when it is set but not a bare origin.
 * The Host header is used only when that env is unset and the host is loopback
 * or listed in ULIXDESK_APP_HOSTS. Forwarded host and proto count only when the
 * proxy secret matches, and the forwarded host still has to be on that list.
 */
export function extensionServerOrigin(request: HeaderSource): string | null {
  const configured = process.env.ULIXDESK_PUBLIC_ORIGIN?.trim();
  if (configured) {
    return normalizeServerOrigin(configured) || null;
  }

  const page = new URL(request.url);
  let host = request.headers.get("host")?.trim() || page.host;
  let proto = page.protocol.replace(/:$/, "");

  if (proxySecretMatches(request.headers.get(PROXY_SECRET_HEADER))) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedProto) proto = forwardedProto;
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwardedHost) host = forwardedHost;
  }

  if (!hostIsTrusted(host)) return null;
  if (proto !== "http" && proto !== "https") return null;
  return normalizeServerOrigin(`${proto}://${host}`) || null;
}
