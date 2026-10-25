import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { resolveDashboardScope } from "@/lib/dashboard-format";
import { loadDashboard } from "@/lib/dashboard";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const requested = (params.scope ?? "").trim().toLowerCase();
  if (requested === "all" && !canManageWorkspace(user.role)) redirect("/dashboard");
  const resolved = resolveDashboardScope(user.role, requested);
  const scope = resolved.ok ? resolved.scope : "me";
  const loaded = await loadDashboard({ actor: user, scope });
  if (!loaded.ok) redirect("/dashboard");
  return <DashboardView initial={loaded.dashboard} />;
}
