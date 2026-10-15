import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { apiCodes, apiError, timerFailureApiCode } from "@/lib/api-errors";
import { serializeTimer } from "@/lib/time-api";
import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import { startTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: true });
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.INVALID_JSON), 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.INVALID_JSON), 400);
  }

  const record = body as Record<string, unknown>;
  if (typeof record.projectId !== "string") {
    return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.INVALID_JSON), 400);
  }
  if (record.note != null && typeof record.note !== "string") {
    return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.INVALID_JSON), 400);
  }

  const result = await startTimer({
    projectId: record.projectId,
    note: typeof record.note === "string" ? record.note : "",
    now: new Date(),
    userId: actor.userId,
    actorId: actor.userId,
    source: actor.source,
  });

  if (!result.ok) {
    const status =
      result.code === "already-running" || result.code === "budget-reached"
        ? 409
        : result.code === "project-missing"
          ? 404
          : 400;
    return jsonApi(
      request,
      {
        ...apiError(timerFailureMessage(result.code), timerFailureApiCode(result.code)),
        ...(result.timer ? { timer: serializeTimer(result.timer) } : {}),
      },
      status,
    );
  }

  return jsonApi(
    request,
    {
      timer: serializeTimer(result.timer),
      warnings: result.warning ? [result.warning] : [],
    },
    201,
  );
}
