import { findUsableAccessToken, markAccessTokenUsed, parseBearerToken } from "@/lib/access-tokens";
import { extensionCorsHeaders, withExtensionCors } from "@/lib/extension-cors";
import { timeCopy } from "@/lib/time-copy";
import { tokenCopy } from "@/lib/token-copy";
import { jsonContentTypeRefusal, unauthenticatedApiRefusal } from "@/lib/timer-api-guard";

export function jsonApi(request: Request, body: unknown, status = 200) {
  const headers = extensionCorsHeaders(request);
  headers.set("cache-control", "no-store");
  return Response.json(body, { status, headers });
}

export function optionsResponse(request: Request) {
  const headers = extensionCorsHeaders(request);
  if (!headers.has("Access-Control-Allow-Origin")) {
    return Response.json({ error: timeCopy.originForbidden }, { status: 403 });
  }
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 204, headers });
}

/**
 * Bearer tokens skip the origin and host checks. A bad token is 401 and does
 * not fall through to the same-origin rules. Requests with no Authorization
 * header keep those rules.
 */
export async function authorizeApiRequest(request: Request, options: { requireJson: boolean }) {
  if (options.requireJson) {
    const typeRefusal = jsonContentTypeRefusal(request);
    if (typeRefusal) return withExtensionCors(request, typeRefusal);
  }

  const header = request.headers.get("authorization");
  if (header !== null) {
    const token = parseBearerToken(header);
    if (!token) return jsonApi(request, { error: tokenCopy.bearerRequired }, 401);
    const row = await findUsableAccessToken(token);
    if (!row) return jsonApi(request, { error: tokenCopy.tokenRejected }, 401);
    await markAccessTokenUsed(row.id);
    return null;
  }

  const refused = unauthenticatedApiRefusal(request);
  if (refused) return withExtensionCors(request, refused);
  return null;
}
