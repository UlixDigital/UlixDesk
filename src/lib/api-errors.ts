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
  AUTH_REQUIRED: "AUTH_REQUIRED",
  EXTENSION_NOT_BUILT: "EXTENSION_NOT_BUILT",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
  INVALID_LOGIN: "INVALID_LOGIN",
  EMAIL_REQUIRED: "EMAIL_REQUIRED",
  EMAIL_INVALID: "EMAIL_INVALID",
  PASSWORD_REQUIRED: "PASSWORD_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  REFRESH_INVALID: "REFRESH_INVALID",
  REFRESH_REUSED: "REFRESH_REUSED",
  BUDGET_REACHED: "BUDGET_REACHED",
  INVOICED_TIME: "INVOICED_TIME",
  TODO_UNAVAILABLE: "TODO_UNAVAILABLE",
  TODO_INVALID: "TODO_INVALID",
  SCOPE_FORBIDDEN: "SCOPE_FORBIDDEN",
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
  "budget-reached": apiCodes.BUDGET_REACHED,
  invoiced: apiCodes.INVOICED_TIME,
  "todo-unavailable": apiCodes.TODO_UNAVAILABLE,
};

export function timerFailureApiCode(code: TimerFailureCode) {
  return timerFailureCodes[code];
}
