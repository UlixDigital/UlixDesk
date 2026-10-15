import { findUsableAccessToken, markAccessTokenUsed, parseBearerToken } from "@/lib/access-tokens";
import { apiCodes, apiError } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { extensionCorsHeaders, withExtensionCors } from "@/lib/extension-cors";
import { findUsableExtensionAccess, markExtensionSessionUsed } from "@/lib/extension-session";
import { userFromCookieHeader } from "@/lib/session";
import type { ChangeSource } from "@/lib/time-change-copy";
import { tokenCopy } from "@/lib/token-copy";
import { jsonContentTypeRefusal, originForbiddenMessage, unauthenticatedApiRefusal } from "@/lib/timer-api-guard";

export function jsonApi(request: Request, body: unknown, status = 200) {
  const headers = extensionCorsHeaders(request);
  headers.set("cache-control", "no-store");
  return Response.json(body, { status, headers });
}

export function optionsResponse(request: Request) {
  const headers = extensionCorsHeaders(request);
  if (!headers.has("Access-Control-Allow-Origin")) {
    const pathname = new URL(request.url).pathname;
    return Response.json(apiError(originForbiddenMessage(pathname), apiCodes.ORIGIN_FORBIDDEN), {
      status: 403,
    });
  }
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 204, headers });
}

export type ApiActor = { userId: string; source: ChangeSource };

/**
 * Bearer tokens skip the origin and host checks and act as the token's user.
 * A bad token is 401 and does not fall through. Requests with no Authorization
 * header keep the origin and host rules, then a session cookie for that user.
 */
export async function authorizeApiRequest(
  request: Request,
  options: { requireJson: boolean },
): Promise<ApiActor | Response> {
  if (options.requireJson) {
    const typeRefusal = jsonContentTypeRefusal(request);
    if (typeRefusal) return withExtensionCors(request, typeRefusal);
  }

  const header = request.headers.get("authorization");
  if (header !== null) {
    const token = parseBearerToken(header);
    if (!token) return jsonApi(request, apiError(tokenCopy.bearerRequired, apiCodes.BEARER_REQUIRED), 401);
    const row = await findUsableAccessToken(token);
    if (row) {
      await markAccessTokenUsed(row.id);
      return { userId: row.userId, source: "api" };
    }
    const session = await findUsableExtensionAccess(token);
    if (!session) return jsonApi(request, apiError(tokenCopy.tokenRejected, apiCodes.TOKEN_INVALID), 401);
    await markExtensionSessionUsed(session.id);
    return { userId: session.userId, source: "extension" };
  }

  const refused = unauthenticatedApiRefusal(request);
  if (refused) return withExtensionCors(request, refused);
  const user = await userFromCookieHeader(request.headers.get("cookie"));
  if (!user) {
    return jsonApi(request, apiError(authCopy.apiAuthRequired, apiCodes.AUTH_REQUIRED), 401);
  }
  return { userId: user.id, source: "web" };
}
