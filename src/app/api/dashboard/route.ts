import { authorizeApiRequest, jsonApi } from "@/lib/api-auth";
import { apiCodes, apiError } from "@/lib/api-errors";
import { authCopy } from "@/lib/auth-copy";
import { dashboardCopy } from "@/lib/dashboard-copy";
import { resolveDashboardScope } from "@/lib/dashboard-format";
import { loadDashboard } from "@/lib/dashboard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: false });
  if (actor instanceof Response) return actor;
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true, deactivatedAt: true },
  });
  if (!user || user.deactivatedAt) {
    return jsonApi(request, apiError(authCopy.apiAuthRequired, apiCodes.AUTH_REQUIRED), 401);
  }
  const requested = new URL(request.url).searchParams.get("scope");
  const resolved = resolveDashboardScope(user.role, requested);
  if (!resolved.ok) {
    return jsonApi(request, apiError(dashboardCopy.scopeDenied, apiCodes.SCOPE_FORBIDDEN), 403);
  }
  const loaded = await loadDashboard({ actor: user, scope: resolved.scope });
  if (!loaded.ok) {
    return jsonApi(request, apiError(dashboardCopy.scopeDenied, apiCodes.SCOPE_FORBIDDEN), 403);
  }
  return jsonApi(request, { dashboard: loaded.dashboard });
}
