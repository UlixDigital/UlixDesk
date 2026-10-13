import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { apiError, timerFailureApiCode } from "@/lib/api-errors";
import { serializeStoppedEntry } from "@/lib/time-api";
import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import { stopTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  const refused = await authorizeApiRequest(request, { requireJson: true });
  if (refused) return refused;

  const result = await stopTimer(new Date());
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
