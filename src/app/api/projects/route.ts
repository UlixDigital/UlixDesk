import { listActiveProjectsForPicker } from "@/lib/time-entries";
import { serializeProject } from "@/lib/time-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listActiveProjectsForPicker();
  return Response.json({ projects: projects.map(serializeProject) });
}
