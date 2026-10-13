import { normalizeEmail } from "@/lib/users-validation";

/** Eight failures per 15 minutes, counted separately for the IP and the email. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

type Bucket = { failures: number; resetAt: number };

const ipBuckets = new Map<string, Bucket>();
const accountBuckets = new Map<string, Bucket>();

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
    limited(accountBuckets, normalizeEmail(email), now) ?? { limited: false as const }
  );
}

export function recordLoginFailure(ip: string, email: string, now = Date.now()) {
  bump(ipBuckets, ip, now);
  bump(accountBuckets, normalizeEmail(email), now);
  if (ipBuckets.size > 5000) ipBuckets.clear();
  if (accountBuckets.size > 5000) accountBuckets.clear();
}

export function clearLoginFailures(ip: string, email: string) {
  ipBuckets.delete(ip);
  accountBuckets.delete(normalizeEmail(email));
}

export function resetLoginRateLimits() {
  ipBuckets.clear();
  accountBuckets.clear();
}
