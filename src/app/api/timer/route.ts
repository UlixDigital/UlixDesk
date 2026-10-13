import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { serializeTimer } from "@/lib/time-api";
import { getRunningTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: false });
  if (actor instanceof Response) return actor;
  const timer = await getRunningTimer(actor.userId);
  return jsonApi(request, { timer: timer ? serializeTimer(timer) : null });
}
