import type { ApiProject, ApiTimer, ClientFailure } from "./api";
import { popupCopy } from "./copy";
import { normalizeServerUrl } from "./server-url";
import { formatElapsed } from "./time";

export type PopupModel =
  | { kind: "loading" }
  | { kind: "not-connected" }
  | { kind: "permission" }
  | { kind: "invalid-url" }
  | { kind: "unreachable"; message: string | null }
  | { kind: "unauthorized" }
  | { kind: "unexpected" }
  | { kind: "no-projects" }
  | {
      kind: "idle";
      projects: ApiProject[];
      projectId: string;
      note: string;
      notice: string | null;
      helper: string;
      alert: string | null;
    }
  | {
      kind: "running";
      projectName: string;
      clientName: string | null;
      startedAt: string;
      elapsedLabel: string;
      status: string;
      alert: string | null;
      todoTitle: string | null;
    };

/** Maps a failed token refresh onto the popup error that matches its message. */
export function failureAfterRefresh(message: string): ClientFailure {
  if (message === popupCopy.invalidUrlBody) return { ok: false, reason: "invalid-url" };
  if (message === popupCopy.unexpectedBody) {
    return { ok: false, reason: "invalid-response", message };
  }
  return { ok: false, reason: "unreachable", message };
}

function serverMessage(failure: ClientFailure) {
  if (failure.reason !== "unreachable") return null;
  const message = failure.message?.trim() ?? "";
  if (!message || message === popupCopy.unreachableBody) return null;
  return message;
}

function failureModel(failure: ClientFailure): PopupModel {
  switch (failure.reason) {
    case "not-configured":
      return { kind: "not-connected" };
    case "invalid-url":
      return { kind: "invalid-url" };
    case "unreachable":
      return { kind: "unreachable", message: serverMessage(failure) };
    case "unauthorized":
      return { kind: "unauthorized" };
    default:
      return { kind: "unexpected" };
  }
}

export function derivePopup(input: {
  serverUrl: string;
  token: string;
  permission: boolean;
  projects: ApiProject[] | null;
  timer: ApiTimer | null;
  failure: ClientFailure | null;
  projectId: string;
  note: string;
  now: number;
  projectNotice: string | null;
  startedHere: boolean;
  alert: string | null;
  loading: boolean;
}): PopupModel {
  if (input.loading) return { kind: "loading" };
  if (!input.serverUrl.trim() || !input.token.trim()) return { kind: "not-connected" };
  if (!normalizeServerUrl(input.serverUrl).ok) return { kind: "invalid-url" };
  if (!input.permission) return { kind: "permission" };

  if (input.failure && !input.timer && !input.projects) return failureModel(input.failure);
  if (input.timer) {
    return {
      kind: "running",
      projectName: input.timer.projectName,
      clientName: input.timer.clientName,
      startedAt: input.timer.startedAt,
      elapsedLabel: formatElapsed(input.now - Date.parse(input.timer.startedAt)),
      status: input.startedHere ? popupCopy.timerRunning : popupCopy.alreadyRunning,
      alert: input.alert,
      todoTitle: input.timer.todoTitle?.trim() || null,
    };
  }
  if (input.failure) return failureModel(input.failure);
  if (!input.projects) return { kind: "loading" };
  if (input.projects.length === 0) return { kind: "no-projects" };

  const known = input.projects.some((project) => project.id === input.projectId);
  return {
    kind: "idle",
    projects: input.projects,
    projectId: known ? input.projectId : "",
    note: input.note,
    notice: input.projectNotice,
    helper: known ? popupCopy.idle : popupCopy.chooseProject,
    alert: input.alert,
  };
}

/** Pending until storage is read, so a signed-in popup never paints the sign-in form first. */
export function popupChrome(input: { authResolved: boolean; signedIn: boolean }) {
  if (!input.authResolved) return "pending" as const;
  return input.signedIn ? ("signed-in" as const) : ("sign-in" as const);
}

export function projectOptionLabel(project: ApiProject) {
  return project.client ? `${project.name} · ${project.client.name}` : project.name;
}
