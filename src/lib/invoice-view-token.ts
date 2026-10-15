import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes is 256 bits, above the 128-bit minimum. */
export const VIEW_TOKEN_BYTES = 32;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateViewToken() {
  return randomBytes(VIEW_TOKEN_BYTES).toString("base64url");
}

/** Null unless the token is exactly 32 bytes of base64url. */
export function viewTokenBytes(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== VIEW_TOKEN_BYTES) return null;
  return bytes;
}

export function hashViewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function viewTokenHashesMatch(computedHex: string, storedHex: string) {
  const computed = Buffer.from(computedHex, "hex");
  const stored = Buffer.from(storedHex, "hex");
  if (computed.length === 0 || computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

function sealKey() {
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("ULIXDESK_SESSION_SECRET is not set.");
  }
  return createHash("sha256").update(`ulixdesk-invoice-view-v1\0${secret}`).digest();
}

/** AES-256-GCM under the session secret. The public lookup uses the hash, not this blob. */
export function sealViewToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonce: iv.toString("base64url"),
    cipher: Buffer.concat([encrypted, tag]).toString("base64url"),
  };
}

/** Null when the secret changed or the sealed copy was altered. */
export function openViewToken(nonce: string, sealed: string) {
  try {
    const iv = Buffer.from(nonce, "base64url");
    const payload = Buffer.from(sealed, "base64url");
    if (iv.length !== 12 || payload.length < 17) return null;
    const tag = payload.subarray(payload.length - 16);
    const data = payload.subarray(0, payload.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    const token = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    if (!viewTokenBytes(token)) return null;
    return token;
  } catch {
    return null;
  }
}

export function clientViewPath(token: string) {
  return `/v/${token}`;
}
