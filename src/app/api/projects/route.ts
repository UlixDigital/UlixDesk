import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { serializeProject } from "@/lib/time-api";
import { listActiveProjectsForPicker } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const refused = await authorizeApiRequest(request, { requireJson: false });
  if (refused) return refused;
  const projects = await listActiveProjectsForPicker();
  return jsonApi(request, { projects: projects.map(serializeProject) });
}
