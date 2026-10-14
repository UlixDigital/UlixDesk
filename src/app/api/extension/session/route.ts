import { apiCodes, apiError } from "@/lib/api-errors";
import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { authCopy } from "@/lib/auth-copy";
import { authenticateLogin } from "@/lib/auth";
import { deviceLabelFromUserAgent } from "@/lib/device-label";
import { guardExtensionSession, readJsonObject } from "@/lib/extension-session-guard";
import { createExtensionSession } from "@/lib/extension-session";
import { requestIp } from "@/lib/request-headers";
import { timeCopy } from "@/lib/time-copy";
import { tokenCopy } from "@/lib/token-copy";
import { prisma } from "@/lib/db";
import { validateEmail } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: false });
  if (actor instanceof Response) return actor;
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, email: true, deactivatedAt: true },
  });
  if (!user || user.deactivatedAt) {
    return jsonApi(request, apiError(tokenCopy.tokenRejected, apiCodes.TOKEN_INVALID), 401);
  }
  return jsonApi(request, { user: { name: user.name, email: user.email } });
}

export async function POST(request: Request) {
  const refused = guardExtensionSession(request);
  if (refused) return refused;

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return jsonApi(request, apiError(timeCopy.invalidJsonBody, apiCodes.INVALID_JSON), 400);
  }
  const emailRaw = typeof parsed.body.email === "string" ? parsed.body.email : "";
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
  const email = validateEmail(emailRaw);
  if (!email.ok) {
    const code = email.error === authCopy.emailRequired ? apiCodes.EMAIL_REQUIRED : apiCodes.EMAIL_INVALID;
    return jsonApi(request, apiError(email.error, code), 400);
  }
  if (!password) {
    return jsonApi(request, apiError(authCopy.passwordRequired, apiCodes.PASSWORD_REQUIRED), 400);
  }

  const result = await authenticateLogin(email.email, password, await requestIp());
  if (!result.ok) {
    if (result.code === "rate-limited") {
      return jsonApi(request, apiError(result.error, apiCodes.RATE_LIMITED), 429);
    }
    if (result.code === "deactivated") {
      return jsonApi(request, apiError(result.error, apiCodes.ACCOUNT_DEACTIVATED), 403);
    }
    return jsonApi(request, apiError(result.error, apiCodes.INVALID_LOGIN), 401);
  }

  const created = await createExtensionSession({
    userId: result.user.id,
    label: deviceLabelFromUserAgent(request.headers.get("user-agent")),
  });
  return jsonApi(
    request,
    {
      accessToken: created.accessToken,
      refreshToken: created.refreshToken,
      accessExpiresAt: created.accessExpiresAt.toISOString(),
      refreshExpiresAt: created.refreshExpiresAt.toISOString(),
      user: { name: result.user.name, email: result.user.email },
    },
    201,
  );
}
