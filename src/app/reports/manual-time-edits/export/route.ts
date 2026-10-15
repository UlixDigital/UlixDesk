import { requireUser } from "@/lib/auth";
import { renderReportPdf, timeChangesToBlocks } from "@/lib/report-pdf";
import { describeTimeEditFilters, timeChangeCodes, timeChangeCopy } from "@/lib/time-change-copy";
import { prepareTimeEdits } from "@/lib/time-change-request";

export async function GET(request: Request) {
  const actor = await requireUser();
  const url = new URL(request.url);
  const params: Record<string, string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    params[key] = url.searchParams.getAll(key);
  }
  const prepared = await prepareTimeEdits({ actor, params, exportAll: true });
  if (prepared.failure === "range") {
    return text(timeChangeCopy.rangeOrder, 400, timeChangeCodes.RANGE_ORDER);
  }
  if (prepared.failure === "large") {
    return text(timeChangeCopy.tooLarge, 400, timeChangeCodes.TIME_CHANGE_TOO_LARGE);
  }
  const pdf = await renderReportPdf({
    title: timeChangeCopy.pageTitle,
    filters: describeTimeEditFilters({
      from: prepared.from,
      to: prepared.to,
      timeZone: prepared.timeZone,
      showMember: prepared.manager,
      memberName: prepared.memberName,
      clientName: prepared.clientName,
      projectName: prepared.projectName,
      actionLabel: prepared.actionLabel,
    }),
    blocks: timeChangesToBlocks(prepared.items),
    empty: prepared.filtered ? timeChangeCopy.emptyFiltered : timeChangeCopy.empty,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="time-edits.pdf"',
      "Cache-Control": "no-store",
    },
  });
}

function text(body: string, status: number, code: string) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Error-Code": code,
      "Cache-Control": "no-store",
    },
  });
}
