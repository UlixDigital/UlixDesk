import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { dashboardCopy } from "@/lib/dashboard-copy";
import { loadDashboard } from "@/lib/dashboard";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dashboardCopy.title,
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const loaded = await loadDashboard({ role: user.role });
  if (!loaded.ok) redirect("/clients");
  return <DashboardView initial={loaded.dashboard} />;
}
