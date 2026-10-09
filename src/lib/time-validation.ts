import {
  MAX_ENTRY_MS,
  NOTE_MAX,
  timeCopy,
} from "@/lib/time-copy";
import {
  addCalendarDays,
  isRealCalendarDate,
  isRealClockTime,
  isValidTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/time-zone";

export type TimeEntryFormValues = {
  projectId: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  billable: boolean;
  note: string;
  timeZone: string;
};

export type TimeEntryFieldErrors = {
  projectId?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  form?: string;
};

export type TimeEntryFormState = {
  errors: TimeEntryFieldErrors;
  values: TimeEntryFormValues;
};

export type NormalizedTimeEntry = {
  projectId: string;
  startedAt: Date;
  endedAt: Date;
  billable: boolean;
  note: string | null;
  timeZone: string;
  date: string;
};

export type IntervalError = "end-after-start" | "too-long" | "future";

export function emptyTimeEntryFormValues(
  timeZone: string,
  date = "",
): TimeEntryFormValues {
  return {
    projectId: "",
    date,
    endDate: "",
    startTime: "",
    endTime: "",
    billable: true,
    note: "",
    timeZone,
  };
}

export function billableDefault(
  projects: Array<{ id: string; billable: boolean }>,
  projectId: string,
) {
  return projects.find((project) => project.id === projectId)?.billable ?? true;
}

/** CRLF and lone CR become LF before the note is measured or stored. */
export function normalizeNote(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * From and To are one civil date unless To is strictly earlier than From.
 * In that case the end is that clock time on the next day.
 * Equal times stay on the start date and fail validation.
 * An explicit end date that is not the start date is kept as entered,
 * which is how a deliberate 24-hour entry is written.
 */
export function resolveManualEndDate(input: {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
}) {
  const date = input.date.trim();
  const explicit = input.endDate.trim();
  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  const sameCivilDay = !explicit || explicit === date;
  if (
    sameCivilDay &&
    isRealCalendarDate(date) &&
    isRealClockTime(startTime) &&
    isRealClockTime(endTime) &&
    endTime < startTime
  ) {
    return addCalendarDays(date, 1);
  }
  return explicit || date;
}

/** True only for the automatic next-day roll, when To is strictly earlier than From. */
export function manualEntryEndsNextDay(input: {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
}) {
  const date = input.date.trim();
  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  if (!isRealCalendarDate(date) || !isRealClockTime(startTime) || !isRealClockTime(endTime)) {
    return false;
  }
  if (endTime >= startTime) return false;
  return resolveManualEndDate(input) === addCalendarDays(date, 1);
}

export function parseTimeEntryFormData(formData: FormData): TimeEntryFormValues {
  const billable = formData.get("billable");
  const date = String(formData.get("date") ?? "");
  return {
    projectId: String(formData.get("projectId") ?? ""),
    date,
    endDate: String(formData.get("endDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    billable: billable === "true" || billable === "on",
    note: String(formData.get("note") ?? ""),
    timeZone: String(formData.get("timeZone") ?? ""),
  };
}

export function intervalError(input: {
  startedAt: Date;
  endedAt: Date;
  now: Date;
}): IntervalError | null {
  const duration = input.endedAt.getTime() - input.startedAt.getTime();
  if (duration <= 0) return "end-after-start";
  if (duration > MAX_ENTRY_MS) return "too-long";
  if (input.endedAt.getTime() > input.now.getTime()) return "future";
  return null;
}

export function intervalErrorMessage(error: IntervalError) {
  if (error === "end-after-start") return timeCopy.endAfterStart;
  if (error === "too-long") return timeCopy.tooLong;
  return timeCopy.futureEnd;
}

export function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  return startA < endB && startB < endA;
}

export function validateTimeEntryInput(
  input: TimeEntryFormValues,
  now: Date,
):
  | { ok: true; data: NormalizedTimeEntry }
  | { ok: false; errors: TimeEntryFieldErrors; values: TimeEntryFormValues } {
  const errors: TimeEntryFieldErrors = {};
  const values: TimeEntryFormValues = {
    projectId: input.projectId,
    date: input.date,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    billable: input.billable,
    note: input.note,
    timeZone: input.timeZone,
  };

  const projectId = input.projectId.trim();
  if (!projectId) errors.projectId = timeCopy.projectRequired;

  const note = normalizeNote(input.note);
  values.note = note;
  if (note.length > NOTE_MAX) errors.note = timeCopy.noteTooLong;

  if (!isValidTimeZone(input.timeZone)) {
    errors.form = timeCopy.invalidTimeZone;
  }

  const date = input.date.trim();
  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  const endDate = resolveManualEndDate({
    date,
    endDate: input.endDate,
    startTime,
    endTime,
  });
  values.endDate = endDate === date ? "" : endDate;
  if (!isRealCalendarDate(date)) errors.date = timeCopy.invalidDate;
  if (input.endDate.trim() && !isRealCalendarDate(endDate)) {
    errors.endDate = timeCopy.invalidDate;
  }
  if (!isRealClockTime(startTime)) errors.startTime = timeCopy.invalidTime;
  if (!isRealClockTime(endTime)) errors.endTime = timeCopy.invalidTime;

  let startedAt: Date | null = null;
  let endedAt: Date | null = null;
  if (
    !errors.form &&
    !errors.date &&
    !errors.endDate &&
    !errors.startTime &&
    !errors.endTime
  ) {
    startedAt = zonedDateTimeToUtc(date, startTime, input.timeZone);
    endedAt = zonedDateTimeToUtc(endDate, endTime, input.timeZone);
    if (!startedAt) errors.startTime = timeCopy.invalidTime;
    if (!endedAt) errors.endTime = timeCopy.invalidTime;
  }

  if (startedAt && endedAt && !errors.endTime) {
    const interval = intervalError({ startedAt, endedAt, now });
    if (interval) errors.endTime = intervalErrorMessage(interval);
  }

  if (Object.keys(errors).length > 0 || !startedAt || !endedAt) {
    return { ok: false, errors, values };
  }

  return {
    ok: true,
    data: {
      projectId,
      startedAt,
      endedAt,
      billable: input.billable,
      note: note || null,
      timeZone: input.timeZone,
      date,
    },
  };
}
