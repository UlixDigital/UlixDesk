import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { serializeTimer } from "@/lib/time-api";
import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import { startTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  const refused = await authorizeApiRequest(request, { requireJson: true });
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonApi(request, { error: timeCopy.invalidJson }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonApi(request, { error: timeCopy.invalidJson }, 400);
  }

  const record = body as Record<string, unknown>;
  if (typeof record.projectId !== "string") {
    return jsonApi(request, { error: timeCopy.invalidJson }, 400);
  }
  if (record.note != null && typeof record.note !== "string") {
    return jsonApi(request, { error: timeCopy.invalidJson }, 400);
  }

  const result = await startTimer({
    projectId: record.projectId,
    note: typeof record.note === "string" ? record.note : "",
    now: new Date(),
  });

  if (!result.ok) {
    const status =
      result.code === "already-running" ? 409 : result.code === "project-missing" ? 404 : 400;
    return jsonApi(
      request,
      {
        error: timerFailureMessage(result.code),
        ...(result.timer ? { timer: serializeTimer(result.timer) } : {}),
      },
      status,
    );
  }

  return jsonApi(request, { timer: serializeTimer(result.timer) }, 201);
}
