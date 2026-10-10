"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { timeCopy, timerFailureMessage } from "@/lib/time-copy";
import {
  createManualEntry,
  deleteTimeEntry,
  getTimeEntry,
  projectSelectionError,
  startTimer,
  stopTimer,
  updateManualEntry,
} from "@/lib/time-entries";
import { timesheetsHref } from "@/lib/timesheet";
import {
  parseTimeEntryFormData,
  validateTimeEntryInput,
  type TimeEntryFormState,
} from "@/lib/time-validation";

export type TimerActionState = {
  error: string | null;
  warnings: string[];
};

function revalidateTimeViews(clientId: string | null) {
  revalidatePath("/timesheets", "layout");
  revalidatePath("/projects", "layout");
  revalidatePath("/clients", "layout");
  if (clientId) revalidatePath(`/clients/${clientId}/edit`);
}

export async function saveTimeEntryAction(
  _previous: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const values = parseTimeEntryFormData(formData);
  const now = new Date();
  const result = validateTimeEntryInput(values, now);
  if (!result.ok) return { errors: result.errors, values: result.values };

  const id = String(formData.get("id") ?? "");
  const existing = id ? await getTimeEntry(id) : null;
  if (id && (!existing || !existing.endedAt)) {
    return { errors: { form: timeCopy.entryGone }, values };
  }

  const selection = await projectSelectionError(
    result.data.projectId,
    existing?.projectId ?? null,
  );
  if (selection === "missing") {
    return { errors: { projectId: timeCopy.projectMissing }, values };
  }
  if (selection === "archived") {
    return { errors: { projectId: timeCopy.projectInactive }, values };
  }

  let saved: { overlap: boolean; clientId: string | null };
  try {
    if (!existing) {
      const created = await createManualEntry(result.data, now);
      saved = {
        overlap: created.overlap,
        clientId: created.entry.project.client?.id ?? null,
      };
    } else {
      const updated = await updateManualEntry(existing.id, result.data, now);
      if (!updated) return { errors: { form: timeCopy.entryGone }, values };
      saved = {
        overlap: updated.overlap,
        clientId: updated.entry.project.client?.id ?? null,
      };
    }
  } catch (error) {
    console.error("Failed to save time entry", error);
    return { errors: { form: timeCopy.saveFailed }, values };
  }

  revalidateTimeViews(saved.clientId);
  redirect(
    timesheetsHref({
      date: result.data.date,
      notice: saved.overlap ? "overlap" : null,
    }),
  );
}

export async function deleteTimeEntryAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!id) return;
  const deleted = await deleteTimeEntry(id);
  if (!deleted.ok) {
    if (deleted.reason === "running") {
      redirect(timesheetsHref({ date: date || undefined, notice: "running" }));
    }
    return;
  }
  revalidateTimeViews(deleted.entry.project.client?.id ?? null);
  redirect(timesheetsHref({ date: date || undefined }));
}

export async function startTimerAction(
  _previous: TimerActionState,
  formData: FormData,
): Promise<TimerActionState> {
  const result = await startTimer({
    projectId: String(formData.get("projectId") ?? ""),
    note: "",
    now: new Date(),
  });
  if (!result.ok) {
    return { error: timerFailureMessage(result.code), warnings: [] };
  }
  revalidateTimeViews(result.timer.project.client?.id ?? null);
  return { error: null, warnings: [] };
}

export async function stopTimerAction(
  _previous: TimerActionState,
  formData: FormData,
): Promise<TimerActionState> {
  // useActionState always passes the form body. Stopping does not read it.
  void formData;
  const result = await stopTimer(new Date());
  if (!result.ok) {
    return { error: timerFailureMessage(result.code), warnings: [] };
  }
  revalidateTimeViews(result.entry.project.client?.id ?? null);
  const warnings: string[] = [];
  if (result.capped) warnings.push(timeCopy.timerCapped);
  if (result.overlap) warnings.push(timeCopy.overlap);
  return { error: null, warnings };
}
