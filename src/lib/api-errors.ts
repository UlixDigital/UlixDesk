import type { TimerFailureCode } from "@/lib/time-copy";

/** Machine-readable codes returned next to the human `error` string. */
export const apiCodes = {
  ALREADY_RUNNING: "ALREADY_RUNNING",
  PROJECT_REQUIRED: "PROJECT_REQUIRED",
  PROJECT_ARCHIVED: "PROJECT_ARCHIVED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  NOTE_TOO_LONG: "NOTE_TOO_LONG",
  NOT_RUNNING: "NOT_RUNNING",
  TOO_SHORT: "TOO_SHORT",
  INVALID_JSON: "INVALID_JSON",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  ORIGIN_FORBIDDEN: "ORIGIN_FORBIDDEN",
  HOST_FORBIDDEN: "HOST_FORBIDDEN",
  BEARER_REQUIRED: "BEARER_REQUIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
} as const;

export type ApiErrorCode = (typeof apiCodes)[keyof typeof apiCodes];

export function apiError(error: string, code: ApiErrorCode) {
  return { error, code };
}

const timerFailureCodes: Record<TimerFailureCode, ApiErrorCode> = {
  "already-running": apiCodes.ALREADY_RUNNING,
  "project-required": apiCodes.PROJECT_REQUIRED,
  "project-inactive": apiCodes.PROJECT_ARCHIVED,
  "project-missing": apiCodes.PROJECT_NOT_FOUND,
  "note-too-long": apiCodes.NOTE_TOO_LONG,
  "not-running": apiCodes.NOT_RUNNING,
  "too-short": apiCodes.TOO_SHORT,
};

export function timerFailureApiCode(code: TimerFailureCode) {
  return timerFailureCodes[code];
}
