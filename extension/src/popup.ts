import { fetchProjects, fetchTimer, startTimer, stopTimer, type ApiProject, type ApiTimer, type ClientFailure } from "./api";
import { popupCopy } from "./copy";
import { derivePopup, projectOptionLabel, type PopupModel } from "./popup-state";
import { readSettings, writeSettings } from "./storage";
import { hostPermissionPattern, normalizeServerUrl } from "./server-url";
import { formatElapsed } from "./time";

const app = document.querySelector("#app");
if (!app) throw new Error("Missing popup root");
const root = app;

let projects: ApiProject[] | null = null;
let timer: ApiTimer | null = null;
let failure: ClientFailure | null = null;
let projectId = "";
let note = "";
let archivedNotice = false;
let startedHere = false;
let alertMessage: string | null = null;
let loading = true;
let busy = false;
let permission = false;
let serverUrl = "";
let token = "";
let tick = 0;

function requestBadgeRefresh() {
  void chrome.runtime.sendMessage({ type: "refresh-badge" });
}

async function load() {
  loading = true;
  startedHere = false;
  archivedNotice = false;
  render();
  const settings = await readSettings();
  serverUrl = settings.serverUrl;
  token = settings.token;
  projectId = settings.lastProjectId;
  const parsed = normalizeServerUrl(serverUrl);
  permission =
    parsed.ok &&
    (await chrome.permissions.contains({ origins: [hostPermissionPattern(parsed.origin)] }));

  if (!serverUrl.trim() || !token.trim() || !permission || !parsed.ok) {
    projects = null;
    timer = null;
    failure = null;
    loading = false;
    render();
    requestBadgeRefresh();
    return;
  }

  const [projectResult, timerResult] = await Promise.all([
    fetchProjects(settings),
    fetchTimer(settings),
  ]);
  failure = !projectResult.ok ? projectResult : !timerResult.ok ? timerResult : null;
  projects = projectResult.ok ? projectResult.projects : null;
  timer = timerResult.ok ? timerResult.timer : null;
  if (
    settings.lastProjectId &&
    projects &&
    !projects.some((project) => project.id === settings.lastProjectId)
  ) {
    archivedNotice = projects.length > 0;
    projectId = "";
    await writeSettings({ lastProjectId: "" });
  }
  loading = false;
  render();
  requestBadgeRefresh();
}

function render() {
  const model = derivePopup({
    serverUrl,
    token,
    permission,
    projects,
    timer,
    failure,
    projectId,
    note,
    now: Date.now(),
    archivedNotice,
    startedHere,
    alert: alertMessage,
    loading,
  });
  root.replaceChildren(view(model));
  if (model.kind === "running") scheduleTick(model.startedAt);
  else window.clearInterval(tick);
}

function scheduleTick(startedAt: string) {
  window.clearInterval(tick);
  tick = window.setInterval(() => {
    const elapsed = root.querySelector("[data-elapsed]");
    if (!elapsed) return;
    elapsed.textContent = formatElapsed(Date.now() - Date.parse(startedAt));
  }, 1000);
}

function view(model: PopupModel) {
  const shell = el("div", "shell");
  shell.append(header());
  shell.append(bodyFor(model));
  return shell;
}

function header() {
  const row = el("div", "brand");
  const mark = el("span", "mark", "U");
  const text = el("div", "brand-text");
  text.append(el("span", "brand-name", "UlixDesk"));
  text.append(el("span", "brand-meta", "Timer"));
  row.append(mark, text);
  return row;
}

function bodyFor(model: PopupModel) {
  const panel = el("div", "panel");
  switch (model.kind) {
    case "loading":
      panel.append(statusBlock(popupCopy.loading, ""));
      break;
    case "not-connected":
      panel.append(
        statusBlock(popupCopy.notConnectedTitle, popupCopy.notConnectedBody),
        button(popupCopy.openOptions, "primary", () => void chrome.runtime.openOptionsPage()),
      );
      break;
    case "permission":
      panel.append(
        statusBlock(popupCopy.permissionTitle, popupCopy.permissionBody),
        button(popupCopy.openOptions, "primary", () => void chrome.runtime.openOptionsPage()),
      );
      break;
    case "invalid-url":
      panel.append(
        statusBlock(popupCopy.invalidUrlTitle, popupCopy.invalidUrlBody),
        button(popupCopy.openOptions, "primary", () => void chrome.runtime.openOptionsPage()),
      );
      break;
    case "unreachable":
      panel.append(
        statusBlock(popupCopy.unreachableTitle, popupCopy.unreachableBody),
        button(popupCopy.tryAgain, "primary", () => void load()),
      );
      break;
    case "unauthorized":
      panel.append(
        statusBlock(popupCopy.unauthorizedTitle, popupCopy.unauthorizedBody),
        button(popupCopy.openOptions, "primary", () => void chrome.runtime.openOptionsPage()),
      );
      break;
    case "unexpected":
      panel.append(
        statusBlock(popupCopy.unexpectedTitle, popupCopy.unexpectedBody),
        button(popupCopy.tryAgain, "primary", () => void load()),
      );
      break;
    case "no-projects":
      panel.append(statusBlock(popupCopy.noProjectsTitle, popupCopy.noProjectsBody));
      break;
    case "idle":
      panel.append(idleForm(model));
      break;
    case "running":
      panel.append(runningView(model));
      break;
    default:
      break;
  }
  return panel;
}

function idleForm(model: Extract<PopupModel, { kind: "idle" }>) {
  const form = document.createElement("form");
  form.className = "stack";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void onStart();
  });

  const projectField = el("label", "field");
  projectField.append(el("span", "label", popupCopy.projectLabel));
  const select = document.createElement("select");
  select.id = "project";
  select.name = "projectId";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = popupCopy.projectPlaceholder;
  select.append(placeholder);
  for (const project of model.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = projectOptionLabel(project);
    select.append(option);
  }
  select.value = model.projectId;
  select.addEventListener("change", () => {
    projectId = select.value;
    archivedNotice = false;
    alertMessage = null;
    void writeSettings({ lastProjectId: projectId });
    render();
  });
  projectField.append(select);

  const noteField = el("label", "field");
  const noteLabel = el("span", "label-row");
  noteLabel.append(el("span", "label", popupCopy.noteLabel));
  noteLabel.append(el("span", "optional", popupCopy.noteOptional));
  const textarea = document.createElement("textarea");
  textarea.id = "note";
  textarea.name = "note";
  textarea.rows = 2;
  textarea.maxLength = 2000;
  textarea.placeholder = popupCopy.notePlaceholder;
  textarea.value = model.note;
  textarea.addEventListener("input", () => {
    note = textarea.value;
  });
  noteField.append(noteLabel, textarea);

  form.append(projectField);
  if (model.notice) form.append(noteLine(model.notice, "notice"));
  else form.append(noteLine(model.helper, "helper"));
  if (model.alert) form.append(noteLine(model.alert, "alert"));
  form.append(noteField);
  const start = button(busy ? popupCopy.starting : popupCopy.start, "primary", () => undefined);
  start.type = "submit";
  start.disabled = busy || !model.projectId;
  form.append(start);
  return form;
}

function runningView(model: Extract<PopupModel, { kind: "running" }>) {
  const wrap = el("div", "stack");
  const status = el("p", "status-line", model.status);
  status.setAttribute("role", "status");
  const name = el("h2", "project-name", model.projectName);
  wrap.append(status, name);
  if (model.clientName) wrap.append(el("p", "client-name", model.clientName));
  const elapsed = el("p", "elapsed", model.elapsedLabel);
  elapsed.dataset.elapsed = "true";
  const elapsedLabel = el("span", "sr-only", `${popupCopy.elapsedLabel} `);
  elapsed.prepend(elapsedLabel);
  wrap.append(elapsed);
  if (model.alert) wrap.append(noteLine(model.alert, "alert"));
  wrap.append(
    button(busy ? popupCopy.stopping : popupCopy.stop, "danger", () => void onStop(), busy),
  );
  return wrap;
}

async function onStart() {
  if (busy || !projectId) return;
  busy = true;
  alertMessage = null;
  render();
  const result = await startTimer({ serverUrl, token }, projectId, note.trim());
  busy = false;
  if (result.ok) {
    timer = result.timer;
    note = "";
    archivedNotice = false;
    startedHere = true;
    alertMessage = null;
    failure = null;
  } else if (result.reason === "already-running") {
    timer = result.timer;
    startedHere = false;
    alertMessage = null;
    failure = null;
  } else if (result.reason === "archived") {
    archivedNotice = true;
    projectId = "";
    alertMessage = null;
    await writeSettings({ lastProjectId: "" });
    const refreshed = await fetchProjects({ serverUrl, token });
    if (refreshed.ok) projects = refreshed.projects;
  } else if (result.reason === "unauthorized" || result.reason === "unreachable" || result.reason === "invalid-response") {
    failure = result;
    projects = null;
    timer = null;
  } else if (result.reason === "http") {
    alertMessage = result.message;
  } else {
    failure = result;
  }
  render();
  requestBadgeRefresh();
}

async function onStop() {
  if (busy) return;
  busy = true;
  render();
  const result = await stopTimer({ serverUrl, token });
  busy = false;
  if (result.ok) {
    timer = null;
    alertMessage = result.warnings[0] ?? null;
    failure = null;
  } else if (result.reason === "too-short") {
    alertMessage = result.message;
  } else if (result.reason === "not-running") {
    timer = null;
    alertMessage = null;
  } else if (result.reason === "unauthorized" || result.reason === "unreachable") {
    failure = result;
    projects = null;
    timer = null;
  } else if (result.reason === "http") {
    alertMessage = result.message;
  } else {
    failure = result;
  }
  render();
  requestBadgeRefresh();
}

function statusBlock(title: string, body: string) {
  const wrap = el("div", "stack");
  const heading = el("h2", "state-title", title);
  wrap.append(heading);
  if (body) {
    const paragraph = el("p", "state-body", body);
    paragraph.setAttribute("role", "status");
    wrap.append(paragraph);
  }
  return wrap;
}

function noteLine(text: string, tone: "notice" | "helper" | "alert") {
  const paragraph = el("p", tone, text);
  paragraph.setAttribute("role", tone === "alert" ? "alert" : "status");
  return paragraph;
}

function button(
  label: string,
  tone: "primary" | "danger",
  onClick: () => void,
  disabled = false,
) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = tone === "danger" ? "button danger" : "button primary";
  node.textContent = label;
  node.disabled = disabled;
  node.addEventListener("click", onClick);
  return node;
}

function el(tag: "div" | "span" | "p" | "h2" | "label", className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

void load();
