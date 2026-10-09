import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import { serializeTimer } from "@/lib/time-api";
import { startTimer } from "@/lib/time-entries";
import { timerApiRefusal } from "@/lib/timer-api-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = timerApiRefusal(request);
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: timeCopy.invalidJson }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: timeCopy.invalidJson }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  if (typeof record.projectId !== "string") {
    return Response.json({ error: timeCopy.invalidJson }, { status: 400 });
  }
  if (record.note != null && typeof record.note !== "string") {
    return Response.json({ error: timeCopy.invalidJson }, { status: 400 });
  }

  const result = await startTimer({
    projectId: record.projectId,
    note: typeof record.note === "string" ? record.note : "",
    now: new Date(),
  });

  if (!result.ok) {
    const status =
      result.code === "already-running" ? 409 : result.code === "project-missing" ? 404 : 400;
    return Response.json(
      {
        error: timerFailureMessage(result.code),
        ...(result.timer ? { timer: serializeTimer(result.timer) } : {}),
      },
      { status },
    );
  }

  return Response.json({ timer: serializeTimer(result.timer) }, { status: 201 });
}
