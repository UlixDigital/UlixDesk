import { timeCopy } from "@/lib/time-copy";

/**
 * Origins that may call the timer POST routes besides the app's own origin.
 * The Chrome extension slice should add its origin here, for example
 * "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef".
 * A comma-separated ULIXDESK_TIMER_ORIGINS value is included as well.
 */
export const TIMER_API_ORIGIN_ALLOWLIST: readonly string[] = [];

export function timerOriginAllowlist() {
  const fromEnv = (process.env.ULIXDESK_TIMER_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...TIMER_API_ORIGIN_ALLOWLIST, ...fromEnv];
}

export function isAllowedTimerOrigin(origin: string, appOrigin: string) {
  return origin === appOrigin || timerOriginAllowlist().includes(origin);
}

/** Reject a timer POST that is not JSON or that comes from another website. */
export function timerApiRefusal(request: Request): Response | null {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return Response.json({ error: timeCopy.jsonContentType }, { status: 415 });
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedTimerOrigin(origin, new URL(request.url).origin)) {
    return Response.json({ error: timeCopy.originForbidden }, { status: 403 });
  }

  return null;
}
