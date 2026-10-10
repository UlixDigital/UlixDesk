import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { serializeTimer } from "@/lib/time-api";
import { getRunningTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const refused = await authorizeApiRequest(request, { requireJson: false });
  if (refused) return refused;
  const timer = await getRunningTimer();
  return jsonApi(request, { timer: timer ? serializeTimer(timer) : null });
}
