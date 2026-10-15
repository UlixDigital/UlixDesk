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

export type InvoiceLinkKeyStatus = "ok" | "missing" | "invalid";

export class InvoiceLinkKeyError extends Error {
  constructor(readonly status: Exclude<InvoiceLinkKeyStatus, "ok">) {
    super(status);
    this.name = "InvoiceLinkKeyError";
  }
}

/**
 * `INVOICE_LINK_KEY` is 32 bytes. Hex is 64 characters. Base64 is the
 * `openssl rand -base64 32` form, with or without the trailing `=`.
 * Base64url is accepted too. Anything else is invalid.
 */
export function decodeInvoiceLinkKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    const key = Buffer.from(value, "hex");
    return key.length === 32 ? key : null;
  }
  if (!/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(value)) return null;
  const encoding = value.includes("-") || value.includes("_") ? "base64url" : "base64";
  const key = Buffer.from(value, encoding);
  return key.length === 32 ? key : null;
}

export function invoiceLinkKeyStatus(): InvoiceLinkKeyStatus {
  const raw = process.env.INVOICE_LINK_KEY;
  if (raw === undefined || raw.trim() === "") return "missing";
  return decodeInvoiceLinkKey(raw) ? "ok" : "invalid";
}

function sealKey() {
  const status = invoiceLinkKeyStatus();
  if (status !== "ok") throw new InvoiceLinkKeyError(status);
  const key = decodeInvoiceLinkKey(process.env.INVOICE_LINK_KEY ?? "");
  if (!key) throw new InvoiceLinkKeyError("invalid");
  return key;
}

/** AES-256-GCM under INVOICE_LINK_KEY. The public lookup uses the hash, not this blob. */
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

/** Null when the key is missing, invalid, different, or the sealed copy was altered. */
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
