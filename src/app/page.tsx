import { redirect } from "next/navigation";
import { dashboardLandingPath } from "@/lib/dashboard-format";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(dashboardLandingPath(user?.role));
}
