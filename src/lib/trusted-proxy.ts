import { timingSafeEqual } from "node:crypto";

/** Caddy sets this. The app trusts forwarded headers only when it matches. */
export const PROXY_SECRET_HEADER = "x-ulixdesk-proxy";

const MIN_SECRET_LENGTH = 16;

export function trustedProxySecret() {
  return process.env.ULIXDESK_TRUSTED_PROXY_SECRET?.trim() ?? "";
}

export function proxySecretMatches(provided: string | null | undefined) {
  const expected = trustedProxySecret();
  if (expected.length < MIN_SECRET_LENGTH || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
