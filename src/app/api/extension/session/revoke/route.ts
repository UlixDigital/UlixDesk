import { apiCodes, apiError } from "@/lib/api-errors";
import { jsonApi, optionsResponse } from "@/lib/api-auth";
import { extensionSessionCopy } from "@/lib/extension-session-copy";
import { guardExtensionSession, readJsonObject } from "@/lib/extension-session-guard";
import { isExtensionAccessToken, revokePresentedExtensionSession } from "@/lib/extension-session";
import { parseBearerToken } from "@/lib/access-tokens";

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
  const header = request.headers.get("authorization");
  const bearer = header ? parseBearerToken(header) : null;
  const accessToken = bearer && isExtensionAccessToken(bearer) ? bearer : "";
  if (!refreshToken && !accessToken) {
    return jsonApi(request, apiError(extensionSessionCopy.refreshRequired, apiCodes.REFRESH_INVALID), 400);
  }

  const revoked = await revokePresentedExtensionSession({ refreshToken, accessToken });
  if (!revoked.ok) {
    return jsonApi(request, apiError(extensionSessionCopy.refreshInvalid, apiCodes.REFRESH_INVALID), 401);
  }
  return jsonApi(request, { ok: true });
}
