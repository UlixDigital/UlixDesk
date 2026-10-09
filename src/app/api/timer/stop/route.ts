import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import { serializeStoppedEntry } from "@/lib/time-api";
import { stopTimer } from "@/lib/time-entries";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await stopTimer(new Date());
  if (!result.ok) {
    const status = result.code === "too-short" ? 409 : 404;
    return Response.json(
      { error: timerFailureMessage(result.code) },
      { status },
    );
  }

  const warnings: string[] = [];
  if (result.capped) warnings.push(timeCopy.timerCapped);
  if (result.overlap) warnings.push(timeCopy.overlap);

  return Response.json({
    entry: serializeStoppedEntry(result.entry, result.capped),
    warnings,
  });
}
