"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gateMutation } from "@/lib/auth";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { reportCopy, savedReportCodes, type SavedReportCode } from "@/lib/report-copy";
import {
  createSavedReport,
  deleteSavedReport,
  formParams,
  isSavedReportType,
  parseSavedReportName,
  parseSavedVisibility,
  renameSavedReport,
  reportFormKeys,
} from "@/lib/saved-reports";
import { todayInTimeZone } from "@/lib/time-zone";

export type SavedReportFormState = {
  error: string;
  code: string;
};

export const idleSavedReportState: SavedReportFormState = { error: "", code: "" };

function fail(code: SavedReportCode, error: string): SavedReportFormState {
  return { error, code };
}

export async function saveSavedReportAction(
  _previous: SavedReportFormState,
  formData: FormData,
): Promise<SavedReportFormState> {
  const gate = await gateMutation();
  if (!gate.ok) return { error: gate.error, code: "" };
  const reportType = String(formData.get("reportType") ?? "");
  if (!isSavedReportType(reportType)) {
    return fail(savedReportCodes.SAVED_REPORT_TYPE, reportCopy.savedUnavailable);
  }
  const name = parseSavedReportName(String(formData.get("name") ?? ""));
  if (!name.ok) return fail(name.code, name.error);
  const visibility = parseSavedVisibility(String(formData.get("visibility") ?? ""), gate.user.role);
  if (!visibility.ok) return fail(visibility.code, visibility.error);
  const today = todayInTimeZone(await getWorkspaceTimeZone());
  const created = await createSavedReport({
    actor: gate.user,
    name: name.name,
    reportType,
    visibility: visibility.visibility,
    params: formParams(formData, reportFormKeys(reportType)),
    today,
  });
  if (!created.ok) {
    return fail(created.code, "error" in created ? created.error : reportCopy.savedUnavailable);
  }
  revalidatePath("/reports");
  redirect("/reports?notice=saved");
}

export async function renameSavedReportAction(
  _previous: SavedReportFormState,
  formData: FormData,
): Promise<SavedReportFormState> {
  const gate = await gateMutation();
  if (!gate.ok) return { error: gate.error, code: "" };
  const name = parseSavedReportName(String(formData.get("name") ?? ""));
  if (!name.ok) return fail(name.code, name.error);
  const renamed = await renameSavedReport({
    actor: gate.user,
    id: String(formData.get("id") ?? ""),
    name: name.name,
  });
  if (!renamed.ok) return fail(renamed.code, renamed.error);
  revalidatePath("/reports");
  redirect("/reports?notice=renamed");
}

export async function deleteSavedReportAction(
  _previous: SavedReportFormState,
  formData: FormData,
): Promise<SavedReportFormState> {
  const gate = await gateMutation();
  if (!gate.ok) return { error: gate.error, code: "" };
  const removed = await deleteSavedReport({
    actor: gate.user,
    id: String(formData.get("id") ?? ""),
  });
  if (!removed.ok) return fail(removed.code, removed.error);
  revalidatePath("/reports");
  redirect("/reports?notice=deleted");
}
