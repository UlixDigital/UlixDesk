import { apiCodes, apiError } from "@/lib/api-errors";
import { timeCopy } from "@/lib/time-copy";
import { hostIsTrusted } from "@/lib/timer-api-guard";

/** Routes that accept a bearer token and therefore skip the Host allowlist. */
export const TOKEN_API_PATHS = [
  "/api/projects",
  "/api/timer",
  "/api/timer/start",
  "/api/timer/stop",
] as const;

const BEARER_TOKEN = /^Bearer\s+\S+$/i;

/**
 * A bearer token on a token-authenticated route skips the Host allowlist.
 * The route still rejects a bad token with 401. Any other request, including
 * a bearer token sent to a page or server action, keeps the Host check.
 */
export function bearerSkipsHostCheck(pathname: string, authorization: string | null | undefined) {
  if (!TOKEN_API_PATHS.includes(pathname as (typeof TOKEN_API_PATHS)[number])) return false;
  if (!authorization) return false;
  return BEARER_TOKEN.test(authorization.trim());
}

export function untrustedHostBody() {
  return apiError(timeCopy.hostForbidden, apiCodes.HOST_FORBIDDEN);
}

/**
 * Shared Host decision for middleware. Null means the request may continue.
 * Pages, server actions, and API routes all use this. Bearer calls on the
 * token routes are the only skip.
 */
export function hostGuardRefusal(input: {
  pathname: string;
  host: string | null;
  authorization: string | null;
}): Response | null {
  if (bearerSkipsHostCheck(input.pathname, input.authorization)) return null;
  if (hostIsTrusted(input.host)) return null;
  return Response.json(untrustedHostBody(), {
    status: 403,
    headers: { "cache-control": "no-store" },
  });
}
