import { normalizeEmail } from "@/lib/users-validation";

/**
 * Eight failures per 15 minutes.
 * One bucket is the IP. The other is that IP together with the email.
 * A failure from somewhere else cannot lock the account.
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

type Bucket = { failures: number; resetAt: number };

const ipBuckets = new Map<string, Bucket>();
const pairBuckets = new Map<string, Bucket>();
const passwordBuckets = new Map<string, Bucket>();

function pairKey(ip: string, email: string) {
  return `${ip}\n${normalizeEmail(email)}`;
}

function limited(map: Map<string, Bucket>, key: string, now: number) {
  const bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) return null;
  if (bucket.failures < LOGIN_MAX_FAILURES) return null;
  return { limited: true as const, retryAfterMs: bucket.resetAt - now };
}

function bump(map: Map<string, Bucket>, key: string, now: number) {
  const existing = map.get(key);
  if (!existing || now >= existing.resetAt) {
    map.set(key, { failures: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  if (existing.failures >= LOGIN_MAX_FAILURES) return;
  existing.failures += 1;
}

export function loginLimited(ip: string, email: string, now = Date.now()) {
  return (
    limited(ipBuckets, ip, now) ??
    limited(pairBuckets, pairKey(ip, email), now) ?? { limited: false as const }
  );
}

export function recordLoginFailure(ip: string, email: string, now = Date.now()) {
  bump(ipBuckets, ip, now);
  bump(pairBuckets, pairKey(ip, email), now);
  if (ipBuckets.size > 5000) ipBuckets.clear();
  if (pairBuckets.size > 5000) pairBuckets.clear();
}

export function clearLoginFailures(ip: string, email: string) {
  ipBuckets.delete(ip);
  pairBuckets.delete(pairKey(ip, email));
}

/** Wrong current-password attempts on the signed-in change-password form. Keyed by user id. */
export function passwordChangeLimited(userId: string, now = Date.now()) {
  return limited(passwordBuckets, userId, now) ?? { limited: false as const };
}

export function recordPasswordFailure(userId: string, now = Date.now()) {
  bump(passwordBuckets, userId, now);
  if (passwordBuckets.size > 5000) passwordBuckets.clear();
}

export function clearPasswordFailures(userId: string) {
  passwordBuckets.delete(userId);
}

export function resetLoginRateLimits() {
  ipBuckets.clear();
  pairBuckets.clear();
  passwordBuckets.clear();
}

/** Public invoice page and PDF. One bucket per client address. */
export const PUBLIC_INVOICE_WINDOW_MS = 60_000;
const PUBLIC_INVOICE_DEFAULT_MAX = 60;

const publicInvoiceBuckets = new Map<string, Bucket>();
let publicInvoiceMax = PUBLIC_INVOICE_DEFAULT_MAX;

/**
 * Counts a public invoice read. The 61st read in a minute is refused.
 * Tests can lower the cap with setPublicInvoiceRateLimitForTests.
 */
export function takePublicInvoiceSlot(ip: string, now = Date.now()) {
  const existing = publicInvoiceBuckets.get(ip);
  if (!existing || now >= existing.resetAt) {
    publicInvoiceBuckets.set(ip, { failures: 1, resetAt: now + PUBLIC_INVOICE_WINDOW_MS });
    if (publicInvoiceBuckets.size > 5000) publicInvoiceBuckets.clear();
    return { limited: false as const };
  }
  if (existing.failures >= publicInvoiceMax) {
    return { limited: true as const, retryAfterMs: existing.resetAt - now };
  }
  existing.failures += 1;
  return { limited: false as const };
}

export function setPublicInvoiceRateLimitForTests(max: number) {
  if (process.env.VITEST !== "true") return;
  publicInvoiceMax = max;
}

export function resetPublicInvoiceRateLimits() {
  publicInvoiceBuckets.clear();
  publicInvoiceMax = PUBLIC_INVOICE_DEFAULT_MAX;
}
