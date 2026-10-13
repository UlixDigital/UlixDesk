/**
 * Cookie signing shared by middleware (edge) and the Node server.
 * Web Crypto only: middleware cannot import node:crypto.
 */
const encoder = new TextEncoder();

export const SESSION_COOKIE = "ulixdesk_session";
export const SESSION_SECRET_MIN = 32;

/** The committed local default. Production refuses this value on a public host. */
export const LOCAL_DEV_SESSION_SECRET = "local-dev-session-secret-not-for-production-00";

export function sessionSecretProblem(secret: string, hosts = "") {
  if (secret.length < SESSION_SECRET_MIN) {
    return "ULIXDESK_SESSION_SECRET must be at least 32 characters.";
  }
  if (secret === LOCAL_DEV_SESSION_SECRET && hosts.includes("ulixdigital.com")) {
    return "Refusing the local development session secret on a public UlixDesk host.";
  }
  return null;
}

function base64UrlEncode(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function signSessionCookie(token: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
  return `${token}.${base64UrlEncode(mac)}`;
}

/** Returns the random token when the signature matches. Null otherwise. */
export async function verifySessionCookie(cookie: string, secret: string) {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  if (!token || !signature || secret.length < SESSION_SECRET_MIN) return null;
  const expected = (await signSessionCookie(token, secret)).slice(token.length + 1);
  if (!safeEqual(expected, signature)) return null;
  return token;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function readCookieHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}
