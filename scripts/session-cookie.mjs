import { createHmac } from "node:crypto";

/**
 * Node HMAC of the session cookie. Must match src/lib/session-cookie.ts,
 * which uses Web Crypto because middleware cannot import node:crypto.
 */
export function signSessionCookie(token, secret) {
  const mac = createHmac("sha256", secret).update(token).digest("base64url");
  return `${token}.${mac}`;
}
