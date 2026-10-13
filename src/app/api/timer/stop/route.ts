import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { apiCodes, apiError, timerFailureApiCode } from "@/lib/api-errors";
import { serializeStoppedEntry } from "@/lib/time-api";
import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import { stopTimer } from "@/lib/time-entries";

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
    return jsonApi(request, apiError(timeCopy.invalidJsonBody, apiCodes.INVALID_JSON), 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonApi(request, apiError(timeCopy.invalidJsonBody, apiCodes.INVALID_JSON), 400);
  }

  const result = await stopTimer(new Date(), actor.userId);
  if (!result.ok) {
    const status = result.code === "too-short" ? 409 : 404;
    return jsonApi(
      request,
      apiError(timerFailureMessage(result.code), timerFailureApiCode(result.code)),
      status,
    );
  }

  const warnings: string[] = [];
  if (result.capped) warnings.push(timeCopy.timerCapped);
  if (result.overlap) warnings.push(timeCopy.overlap);

  return jsonApi(request, {
    entry: serializeStoppedEntry(result.entry, result.capped),
    warnings,
  });
}
