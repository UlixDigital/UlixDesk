import type { ApiProject, ApiTimer, ClientFailure } from "./api";
import { popupCopy } from "./copy";
import { normalizeServerUrl } from "./server-url";
import { formatElapsed } from "./time";

export type PopupModel =
  | { kind: "loading" }
  | { kind: "not-connected" }
  | { kind: "permission" }
  | { kind: "invalid-url" }
  | { kind: "unreachable" }
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
    };

function failureModel(failure: ClientFailure): PopupModel {
  switch (failure.reason) {
    case "not-configured":
      return { kind: "not-connected" };
    case "invalid-url":
      return { kind: "invalid-url" };
    case "unreachable":
      return { kind: "unreachable" };
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
  archivedNotice: boolean;
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
      status: popupCopy.alreadyRunning,
      alert: input.alert,
    };
  }
  if (input.failure) return failureModel(input.failure);
  if (!input.projects) return { kind: "loading" };
  if (input.projects.length === 0 && !input.archivedNotice) return { kind: "no-projects" };

  const known = input.projects.some((project) => project.id === input.projectId);
  return {
    kind: "idle",
    projects: input.projects,
    projectId: known ? input.projectId : "",
    note: input.note,
    notice: input.archivedNotice ? popupCopy.projectGone : null,
    helper: known ? popupCopy.idle : popupCopy.chooseProject,
    alert: input.alert,
  };
}

export function projectOptionLabel(project: ApiProject) {
  return project.client ? `${project.name} · ${project.client.name}` : project.name;
}
