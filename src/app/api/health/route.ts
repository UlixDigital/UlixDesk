import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deploy and the image health check call this with no session cookie.
 * SELECT 1 loads the query engine with the app role. A missing engine or a
 * database the app cannot reach answers 503, so the container stays unhealthy.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
