import { serializeTimer } from "@/lib/time-api";
import { getRunningTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export async function GET() {
  const timer = await getRunningTimer();
  return Response.json({ timer: timer ? serializeTimer(timer) : null });
}
