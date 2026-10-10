import { API_PROJECT_INACTIVE } from "./copy";
import { isConfigured, normalizeServerUrl } from "./server-url";

export type ApiProject = {
  id: string;
  name: string;
  billable: boolean;
  client: { id: string; name: string } | null;
};

export type ApiTimer = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string | null;
  startedAt: string;
  billable: boolean;
  note: string | null;
  source: string;
};

export type ConnectionConfig = {
  serverUrl: string;
  token: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ClientFailure =
  | { ok: false; reason: "not-configured" }
  | { ok: false; reason: "invalid-url" }
  | { ok: false; reason: "unreachable" }
  | { ok: false; reason: "unauthorized"; message: string }
  | { ok: false; reason: "invalid-response"; message: string }
  | { ok: false; reason: "http"; status: number; message: string };

export type ProjectsResult = { ok: true; projects: ApiProject[] } | ClientFailure;
export type TimerResult = { ok: true; timer: ApiTimer | null } | ClientFailure;
export type StartResult =
  | { ok: true; timer: ApiTimer }
  | { ok: false; reason: "already-running"; timer: ApiTimer; message: string }
  | { ok: false; reason: "archived"; message: string }
  | ClientFailure;
export type StopResult =
  | { ok: true; warnings: string[] }
  | { ok: false; reason: "too-short"; message: string }
  | { ok: false; reason: "not-running"; message: string }
  | ClientFailure;

type HttpFailure = {
  ok: false;
  reason: "http";
  status: number;
  message: string;
  body: unknown;
};

type RequestJson =
  | { ok: true; status: number; body: unknown }
  | Exclude<ClientFailure, { reason: "http" }>
  | HttpFailure;

function errorMessage(body: unknown) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    const message = body.error.trim();
    if (message) return message;
  }
  return "The server returned an error.";
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function requestJson(
  config: ConnectionConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: string },
  fetchImpl: FetchLike,
): Promise<RequestJson> {
  if (!isConfigured(config)) return { ok: false, reason: "not-configured" };
  const base = normalizeServerUrl(config.serverUrl);
  if (!base.ok) return { ok: false, reason: "invalid-url" };

  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${config.token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetchImpl(`${base.origin}${path}`, {
      method: init.method,
      headers,
      body: init.body,
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  const body = await readBody(response);
  if (response.status === 401) {
    return { ok: false, reason: "unauthorized", message: errorMessage(body) };
  }
  if (body === undefined) {
    return {
      ok: false,
      reason: "invalid-response",
      message: "The server returned an unexpected response.",
    };
  }
  if (!response.ok) {
    return { ok: false, reason: "http", status: response.status, message: errorMessage(body), body };
  }
  return { ok: true, status: response.status, body };
}

function isProject(value: unknown): value is ApiProject {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return false;
  if (typeof record.billable !== "boolean") return false;
  if (record.client === null) return true;
  if (!record.client || typeof record.client !== "object") return false;
  const client = record.client as Record<string, unknown>;
  return typeof client.id === "string" && typeof client.name === "string";
}

function isTimer(value: unknown): value is ApiTimer {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.projectId === "string" &&
    typeof record.projectName === "string" &&
    (record.clientName === null || typeof record.clientName === "string") &&
    typeof record.startedAt === "string" &&
    typeof record.billable === "boolean" &&
    (record.note === null || typeof record.note === "string") &&
    typeof record.source === "string"
  );
}

function clientFailure(result: Exclude<RequestJson, { ok: true }>): ClientFailure {
  if (result.reason === "http") {
    return { ok: false, reason: "http", status: result.status, message: result.message };
  }
  return result;
}

export async function fetchProjects(
  config: ConnectionConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ProjectsResult> {
  const result = await requestJson(config, "/api/projects", { method: "GET" }, fetchImpl);
  if (!result.ok) return clientFailure(result);
  if (!result.body || typeof result.body !== "object" || !("projects" in result.body)) {
    return { ok: false, reason: "invalid-response", message: "The server returned an unexpected response." };
  }
  const projects = (result.body as { projects: unknown }).projects;
  if (!Array.isArray(projects) || !projects.every(isProject)) {
    return { ok: false, reason: "invalid-response", message: "The server returned an unexpected response." };
  }
  return { ok: true, projects };
}

export async function fetchTimer(
  config: ConnectionConfig,
  fetchImpl: FetchLike = fetch,
): Promise<TimerResult> {
  const result = await requestJson(config, "/api/timer", { method: "GET" }, fetchImpl);
  if (!result.ok) return clientFailure(result);
  if (!result.body || typeof result.body !== "object" || !("timer" in result.body)) {
    return { ok: false, reason: "invalid-response", message: "The server returned an unexpected response." };
  }
  const timer = (result.body as { timer: unknown }).timer;
  if (timer === null) return { ok: true, timer: null };
  if (!isTimer(timer)) {
    return { ok: false, reason: "invalid-response", message: "The server returned an unexpected response." };
  }
  return { ok: true, timer };
}

export async function startTimer(
  config: ConnectionConfig,
  projectId: string,
  note: string,
  fetchImpl: FetchLike = fetch,
): Promise<StartResult> {
  const result = await requestJson(
    config,
    "/api/timer/start",
    { method: "POST", body: JSON.stringify({ projectId, note }) },
    fetchImpl,
  );
  if (!result.ok && result.reason === "http" && result.status === 409) {
    const timer = result.body && typeof result.body === "object" ? (result.body as { timer?: unknown }).timer : null;
    if (isTimer(timer)) {
      return { ok: false, reason: "already-running", timer, message: result.message };
    }
  }
  if (!result.ok && result.reason === "http" && result.status === 400 && result.message === API_PROJECT_INACTIVE) {
    return { ok: false, reason: "archived", message: result.message };
  }
  if (!result.ok) return clientFailure(result);
  if (!result.body || typeof result.body !== "object" || !isTimer((result.body as { timer?: unknown }).timer)) {
    return { ok: false, reason: "invalid-response", message: "The server returned an unexpected response." };
  }
  return { ok: true, timer: (result.body as { timer: ApiTimer }).timer };
}

export async function stopTimer(
  config: ConnectionConfig,
  fetchImpl: FetchLike = fetch,
): Promise<StopResult> {
  const result = await requestJson(
    config,
    "/api/timer/stop",
    { method: "POST", body: "{}" },
    fetchImpl,
  );
  if (!result.ok && result.reason === "http" && result.status === 409) {
    return { ok: false, reason: "too-short", message: result.message };
  }
  if (!result.ok && result.reason === "http" && result.status === 404) {
    return { ok: false, reason: "not-running", message: result.message };
  }
  if (!result.ok) return clientFailure(result);
  const warnings =
    result.body &&
    typeof result.body === "object" &&
    Array.isArray((result.body as { warnings?: unknown }).warnings)
      ? (result.body as { warnings: unknown[] }).warnings.filter((item): item is string => typeof item === "string")
      : [];
  return { ok: true, warnings };
}

export function testConnection(config: ConnectionConfig, fetchImpl: FetchLike = fetch) {
  return fetchProjects(config, fetchImpl);
}
