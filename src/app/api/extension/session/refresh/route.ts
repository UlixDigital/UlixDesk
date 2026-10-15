import { apiCodes, apiError } from "@/lib/api-errors";
import { jsonApi, optionsResponse } from "@/lib/api-auth";
import { authCopy } from "@/lib/auth-copy";
import { extensionSessionCopy } from "@/lib/extension-session-copy";
import { guardExtensionSession, readJsonObject } from "@/lib/extension-session-guard";
import { rotateExtensionSession } from "@/lib/extension-session";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  const refused = guardExtensionSession(request);
  if (refused) return refused;

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return jsonApi(request, apiError(extensionSessionCopy.refreshRequired, apiCodes.REFRESH_INVALID), 400);
  }
  const refreshToken = typeof parsed.body.refreshToken === "string" ? parsed.body.refreshToken : "";
  if (!refreshToken) {
    return jsonApi(request, apiError(extensionSessionCopy.refreshRequired, apiCodes.REFRESH_INVALID), 400);
  }

  const rotated = await rotateExtensionSession(refreshToken);
  if (!rotated.ok) {
    if (rotated.code === "deactivated") {
      return jsonApi(request, apiError(authCopy.deactivated, apiCodes.ACCOUNT_DEACTIVATED), 403);
    }
    if (rotated.code === "reused") {
      return jsonApi(request, apiError(extensionSessionCopy.refreshReused, apiCodes.REFRESH_REUSED), 401);
    }
    return jsonApi(request, apiError(extensionSessionCopy.refreshInvalid, apiCodes.REFRESH_INVALID), 401);
  }

  return jsonApi(request, {
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    accessExpiresAt: rotated.accessExpiresAt.toISOString(),
    refreshExpiresAt: rotated.refreshExpiresAt.toISOString(),
    user: rotated.user,
  });
}
