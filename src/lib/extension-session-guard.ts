import { apiCodes, apiError } from "@/lib/api-errors";
import { isAllowedExtensionOrigin, withExtensionCors } from "@/lib/extension-cors";
import { hostIsTrusted, jsonContentTypeRefusal } from "@/lib/timer-api-guard";
import { timeCopy } from "@/lib/time-copy";

/**
 * Password, refresh, and revoke calls come from the extension with no bearer
 * token. They require an allowlisted chrome-extension origin and a trusted host.
 * Other origins get 403 and no CORS headers.
 */
export function guardExtensionSession(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const allowed = Boolean(origin && isAllowedExtensionOrigin(origin));
  const typeRefusal = jsonContentTypeRefusal(request);
  if (typeRefusal) return allowed ? withExtensionCors(request, typeRefusal) : typeRefusal;

  const page = new URL(request.url);
  const host = request.headers.get("host")?.trim() || page.host;
  if (!hostIsTrusted(host)) {
    const response = Response.json(apiError(timeCopy.hostDenied, apiCodes.HOST_FORBIDDEN), {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
    return allowed ? withExtensionCors(request, response) : response;
  }

  if (!allowed) {
    return Response.json(apiError(timeCopy.originDenied, apiCodes.ORIGIN_FORBIDDEN), {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  return null;
}

export async function readJsonObject(request: Request): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  return { ok: true, body: body as Record<string, unknown> };
}
