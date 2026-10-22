import {
  createTodo,
  fetchExtensionVersion,
  fetchProjects,
  fetchSession,
  fetchTimer,
  fetchTodos,
  requestExtensionSignIn,
  startTimer,
  stopTimer,
  type ApiProject,
  type ApiTimer,
  type ApiTodo,
  type ClientFailure,
} from "./api";
import { popupCopy } from "./copy";
import { signOutOfExtension, type EnsureResult } from "./credentials";
import { hostAccessRequest } from "./host-permission";
import { extensionUpdateNotice } from "./extension-version";
import { derivePopup, failureAfterRefresh, popupChrome, projectOptionLabel, type PopupModel } from "./popup-state";
import { describeSignIn } from "./sign-in-state";
import { applyServerSelection, loadBakedServerUrl } from "./default-server";
import { readSettings, writeSettings } from "./storage";
import {
  PRODUCTION_ORIGIN,
  STAGING_ORIGIN,
  hostPermissionPattern,
  normalizeServerUrl,
  originForPreset,
  type ServerPreset,
} from "./server-url";
import { formatElapsed } from "./time";

const app = document.querySelector("#app");
if (!app) throw new Error("Missing popup root");
const root = app;

let projects: ApiProject[] | null = null;
let timer: ApiTimer | null = null;
let failure: ClientFailure | null = null;
let projectId = "";
let note = "";
let todos: ApiTodo[] = [];
let todosForProject = "";
let todosLoading = "";
let todoId = "";
let todoQuery = "";
let todoError: string | null = null;
let projectNotice: string | null = null;
let startedHere = false;
let alertMessage: string | null = null;
let loading = true;
let busy = false;
let permission = false;
let serverUrl = "";
let token = "";
let tick = 0;
let signedIn = false;
let authResolved = false;
let accountName = "";
let accountEmail = "";
let serverPreset: ServerPreset = "custom";
let customUrl = "";
let email = "";
let password = "";
let formError: string | null = null;
let updateNotice: string | null = null;
let noticeGeneration = 0;

function requestBadgeRefresh() {
  void chrome.runtime.sendMessage({ type: "refresh-badge" });
}

function requestEnsureAccess(force = false): Promise<EnsureResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "ensure-access", force }, (result) => {
      const failed = chrome.runtime.lastError;
      if (failed || !result || typeof result !== "object" || !("ok" in result)) {
        resolve({ ok: false, signedOut: false, message: popupCopy.unreachableBody });
        return;
      }
      resolve(result as EnsureResult);
    });
  });
}

function localExtensionVersion() {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "";
  }
}

async function refreshUpdateNotice() {
  const generation = ++noticeGeneration;
  const parsed = normalizeServerUrl(serverUrl);
  let next: string | null = null;
  if (parsed.ok) {
    const published = await fetchExtensionVersion(parsed.origin);
    if (generation !== noticeGeneration) return;
    next = extensionUpdateNotice(published?.version ?? null, localExtensionVersion());
  }
  if (generation !== noticeGeneration) return;
  if (updateNotice === next) return;
  updateNotice = next;
  render();
}

function applyStoredServer(stored: string, baked: string) {
  const applied = applyServerSelection(stored, baked);
  serverUrl = applied.serverUrl;
  serverPreset = applied.serverPreset;
  customUrl = applied.customUrl;
}

function chosenServerUrl() {
  return originForPreset(serverPreset, customUrl);
}

async function load() {
  loading = true;
  authResolved = false;
  startedHere = false;
  projectNotice = null;
  render();
  const settings = await readSettings();
  const baked = settings.serverUrl.trim() ? "" : await loadBakedServerUrl();
  applyStoredServer(settings.serverUrl, baked);
  void refreshUpdateNotice();
  projectId = settings.lastProjectId;
  accountName = settings.userName;
  accountEmail = settings.userEmail;

  if (!settings.token && !settings.refreshToken) {
    signedIn = false;
    authResolved = true;
    token = "";
    projects = null;
    timer = null;
    failure = null;
    loading = false;
    render();
    requestBadgeRefresh();
    return;
  }

  signedIn = true;
  authResolved = true;
  render();

  const parsed = normalizeServerUrl(serverUrl);
  const [ready, allowed] = await Promise.all([
    requestEnsureAccess(),
    parsed.ok
      ? chrome.permissions.contains({ origins: [hostPermissionPattern(parsed.origin)] })
      : Promise.resolve(false),
  ]);
  // Refresh the flag even when ensureAccess fails. A stale false hides the real error
  // behind "Permission needed" after Chrome has already granted access.
  permission = Boolean(parsed.ok && allowed);

  if (!ready.ok) {
    if (ready.signedOut) {
      signedIn = false;
      token = "";
      formError = ready.message || null;
      failure = null;
      loading = false;
      render();
      requestBadgeRefresh();
      return;
    }
    signedIn = true;
    token = settings.token;
    failure = failureAfterRefresh(ready.message);
    projects = null;
    timer = null;
    loading = false;
    render();
    requestBadgeRefresh();
    return;
  }

  signedIn = true;
  token = ready.settings.token;
  const previousServer = serverUrl;
  serverUrl = ready.settings.serverUrl || serverUrl;
  if (serverUrl !== previousServer) void refreshUpdateNotice();
  accountName = ready.settings.userName;
  accountEmail = ready.settings.userEmail;

  if (!permission || !parsed.ok) {
    projects = null;
    timer = null;
    failure = null;
    loading = false;
    render();
    requestBadgeRefresh();
    return;
  }

  let projectResult = await fetchProjects(ready.settings);
  let timerResult = await fetchTimer(ready.settings);
  if (
    ready.settings.refreshToken &&
    ((!projectResult.ok && projectResult.reason === "unauthorized") ||
      (!timerResult.ok && timerResult.reason === "unauthorized"))
  ) {
    const again = await requestEnsureAccess(true);
    if (!again.ok) {
      signedIn = !again.signedOut;
      if (again.signedOut) {
        signedIn = false;
        token = "";
        formError = again.message || null;
      } else {
        failure = failureAfterRefresh(again.message);
      }
      projects = null;
      timer = null;
      loading = false;
      render();
      requestBadgeRefresh();
      return;
    }
    token = again.settings.token;
    accountName = again.settings.userName;
    accountEmail = again.settings.userEmail;
    projectResult = await fetchProjects(again.settings);
    timerResult = await fetchTimer(again.settings);
  }

  const who = await fetchSession({ serverUrl, token });
  if (who.ok) {
    accountName = who.user.name;
    accountEmail = who.user.email;
    await writeSettings({ userName: accountName, userEmail: accountEmail });
  }

  failure = !projectResult.ok ? projectResult : !timerResult.ok ? timerResult : null;
  projects = projectResult.ok ? projectResult.projects : null;
  timer = timerResult.ok ? timerResult.timer : null;
  if (
    settings.lastProjectId &&
    projects &&
    !projects.some((project) => project.id === settings.lastProjectId)
  ) {
    projectNotice = projects.length > 0 ? popupCopy.projectGone : null;
    projectId = "";
    await writeSettings({ lastProjectId: "" });
  }
  loading = false;
  render();
  requestBadgeRefresh();
}

function render() {
  const restoreTodo = document.activeElement instanceof HTMLInputElement && document.activeElement.id === "todo-search";
  root.replaceChildren(view());
  if (restoreTodo) {
    const search = document.getElementById("todo-search");
    if (search instanceof HTMLInputElement) {
      search.focus();
      const end = search.value.length;
      search.setSelectionRange(end, end);
    }
  }
  if (signedIn) {
    const model = currentModel();
    if (model.kind === "running") scheduleTick(model.startedAt);
    else window.clearInterval(tick);
  } else {
    window.clearInterval(tick);
  }
}

function currentModel(): PopupModel {
  return derivePopup({
    serverUrl,
    token,
    permission,
    projects,
    timer,
    failure,
    projectId,
    note,
    now: Date.now(),
    projectNotice,
    startedHere,
    alert: alertMessage,
    loading,
  });
}

function scheduleTick(startedAt: string) {
  window.clearInterval(tick);
  tick = window.setInterval(() => {
    const elapsed = root.querySelector("[data-elapsed]");
    if (!elapsed) return;
    elapsed.textContent = formatElapsed(Date.now() - Date.parse(startedAt));
  }, 1000);
}

function view() {
  const shell = el("div", "shell");
  shell.append(header());
  const chrome = popupChrome({ authResolved, signedIn });
  if (chrome === "pending") {
    shell.append(el("p", "state-body", popupCopy.opening));
    return shell;
  }
  if (chrome === "sign-in") {
    shell.append(signInForm());
    if (updateNotice) shell.append(noteLine(updateNotice, "notice"));
    return shell;
  }
  shell.append(accountStrip());
  if (updateNotice) shell.append(noteLine(updateNotice, "notice"));
  shell.append(bodyFor(currentModel()));
  return shell;
}

function header() {
  const row = el("div", "brand");
  const logo = document.createElement("img");
  logo.className = "logo";
  logo.src = "ulix-logo.svg";
  logo.alt = "Ulix";
  logo.width = 103;
  logo.height = 44;
  row.append(logo);
  return row;
}

function accountStrip() {
  const row = el("div", "account");
  const text = el("div", "brand-text");
  if (accountName || accountEmail) {
    text.append(el("span", "account-name", accountName || accountEmail));
    if (accountName && accountEmail) text.append(el("span", "hint", accountEmail));
  } else {
    text.append(el("span", "account-name", popupCopy.signedInWithToken));
  }
  row.append(text, button(popupCopy.signOut, "secondary", () => void onSignOut(), busy));
  return row;
}

function signInForm() {
  const form = document.createElement("form");
  form.className = "stack";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSignInClick();
  });
  form.append(el("h2", "state-title", popupCopy.signInTitle));
  form.append(el("p", "state-body", popupCopy.signInIntro));
  form.append(serverFields());

  const emailField = el("label", "field");
  emailField.append(el("span", "label", popupCopy.emailLabel));
  const emailInput = document.createElement("input");
  emailInput.id = "email";
  emailInput.name = "email";
  emailInput.type = "email";
  emailInput.autocomplete = "username";
  emailInput.required = true;
  emailInput.value = email;
  emailInput.addEventListener("input", () => {
    email = emailInput.value;
  });
  emailField.append(emailInput);

  const passwordField = el("label", "field");
  passwordField.append(el("span", "label", popupCopy.passwordLabel));
  const passwordInput = document.createElement("input");
  passwordInput.id = "password";
  passwordInput.name = "password";
  passwordInput.type = "password";
  passwordInput.autocomplete = "current-password";
  passwordInput.required = true;
  passwordInput.value = password;
  passwordInput.addEventListener("input", () => {
    password = passwordInput.value;
  });
  passwordField.append(passwordInput);

  form.append(emailField, passwordField);
  if (formError) form.append(noteLine(formError, "alert"));
  const submit = button(busy ? popupCopy.signingIn : popupCopy.signIn, "primary", () => undefined);
  submit.type = "submit";
  submit.disabled = busy;
  form.append(submit);
  return form;
}

function serverFields() {
  const wrap = el("div", "stack");
  wrap.append(el("span", "label", popupCopy.serverLabel));
  if (serverPreset === "custom") {
    const input = document.createElement("input");
    input.id = "server-url";
    input.name = "serverUrl";
    input.type = "url";
    input.inputMode = "url";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "http://127.0.0.1:3000";
    input.value = customUrl;
    input.addEventListener("input", () => {
      customUrl = input.value;
      serverUrl = input.value.trim();
    });
    wrap.append(input);
    wrap.append(el("p", "hint", popupCopy.customServerHint));
  } else {
    const shown = el("p", "server-url", serverUrl);
    shown.id = "server-url";
    wrap.append(shown);
  }
  const choices = el("div", "choice-row");
  if (serverPreset !== "production") {
    choices.append(textButton(popupCopy.useProduction, () => void choosePreset("production")));
  }
  if (serverPreset !== "staging") {
    choices.append(textButton(popupCopy.useStaging, () => void choosePreset("staging")));
  }
  if (serverPreset !== "custom") {
    choices.append(textButton(popupCopy.customServer, () => void choosePreset("custom")));
  }
  wrap.append(choices);
  return wrap;
}

async function choosePreset(preset: ServerPreset) {
  serverPreset = preset;
  formError = null;
  if (preset === "production") serverUrl = PRODUCTION_ORIGIN;
  if (preset === "staging") serverUrl = STAGING_ORIGIN;
  if (preset === "custom") serverUrl = customUrl.trim();
  const parsed = normalizeServerUrl(serverUrl);
  if (parsed.ok) await writeSettings({ serverUrl: parsed.origin });
  render();
  void refreshUpdateNotice();
}

function onSignInClick() {
  const described = describeSignIn({
    serverUrl: chosenServerUrl(),
    email,
    password,
  });
  if (!described.ok) {
    formError = described.message;
    render();
    return;
  }
  const parsed = normalizeServerUrl(described.serverUrl);
  if (!parsed.ok) return;
  const pattern = hostPermissionPattern(parsed.origin);
  const passwordValue = password;
  chrome.permissions.request(hostAccessRequest(pattern), (granted) => {
    void chrome.runtime.lastError;
    if (!granted) {
      formError = popupCopy.permissionBody;
      render();
      return;
    }
    void completeSignIn(described.serverUrl, described.email, passwordValue);
  });
}

async function completeSignIn(nextServer: string, nextEmail: string, passwordValue: string) {
  busy = true;
  formError = null;
  render();
  const result = await requestExtensionSignIn({
    serverUrl: nextServer,
    email: nextEmail,
    password: passwordValue,
  });
  busy = false;
  if (!result.ok) {
    formError = result.message;
    render();
    return;
  }
  password = "";
  await writeSettings({
    serverUrl: nextServer,
    token: result.session.accessToken,
    refreshToken: result.session.refreshToken,
    accessExpiresAt: result.session.accessExpiresAt,
    userName: result.session.user.name,
    userEmail: result.session.user.email,
  });
  formError = null;
  await load();
}

async function onSignOut() {
  if (busy) return;
  busy = true;
  render();
  const result = await signOutOfExtension();
  busy = false;
  if (!result.ok) {
    formError = result.message;
    alertMessage = result.message;
    render();
    return;
  }
  signedIn = false;
  token = "";
  password = "";
  accountName = "";
  accountEmail = "";
  projects = null;
  timer = null;
  failure = null;
  formError = null;
  alertMessage = null;
  render();
  requestBadgeRefresh();
}

function grantPermission() {
  const parsed = normalizeServerUrl(serverUrl);
  if (!parsed.ok) return;
  const pattern = hostPermissionPattern(parsed.origin);
  chrome.permissions.request(hostAccessRequest(pattern), (granted) => {
    void chrome.runtime.lastError;
    if (!granted) {
      alertMessage = popupCopy.permissionBody;
      render();
      return;
    }
    void load();
  });
}

function bodyFor(model: PopupModel) {
  const panel = el("div", "panel");
  switch (model.kind) {
    case "loading":
      panel.append(statusBlock(popupCopy.loading, ""));
      break;
    case "not-connected":
      panel.append(signInForm());
      break;
    case "permission":
      panel.append(
        statusBlock(popupCopy.permissionTitle, popupCopy.permissionBody),
        button(popupCopy.grant, "primary", () => grantPermission()),
      );
      break;
    case "invalid-url":
      panel.append(
        statusBlock(popupCopy.invalidUrlTitle, popupCopy.invalidUrlBody),
        optionsLink(),
      );
      break;
    case "unreachable":
      panel.append(
        statusBlock(popupCopy.unreachableTitle, popupCopy.unreachableBody),
        ...(model.message ? [noteLine(model.message, "alert")] : []),
        button(popupCopy.tryAgain, "primary", () => void load()),
      );
      break;
    case "unauthorized":
      panel.append(
        statusBlock(popupCopy.unauthorizedTitle, popupCopy.unauthorizedBody),
        button(popupCopy.signOut, "primary", () => void onSignOut()),
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
    projectNotice = null;
    alertMessage = null;
    todoId = "";
    todoQuery = "";
    todoError = null;
    todos = [];
    todosForProject = "";
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
  if (model.projectId) form.append(todoField(model.projectId));
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
  if (model.todoTitle) wrap.append(el("p", "client-name", model.todoTitle));
  if (model.clientName) wrap.append(el("p", "client-name", model.clientName));
  const elapsed = el("p", "elapsed", model.elapsedLabel);
  elapsed.dataset.elapsed = "true";
  const elapsedLabel = el("span", "sr-only", `${popupCopy.elapsedLabel} `);
  elapsed.prepend(elapsedLabel);
  wrap.append(elapsed);
  if (model.alert) wrap.append(noteLine(model.alert, "alert"));
  wrap.append(button(busy ? popupCopy.stopping : popupCopy.stop, "danger", () => void onStop(), busy));
  return wrap;
}

function todoField(currentProjectId: string) {
  ensureTodos(currentProjectId);
  const field = el("div", "field");
  const label = el("span", "label-row");
  label.append(el("span", "label", popupCopy.todoLabel));
  label.append(el("span", "optional", popupCopy.todoOptional));
  const search = document.createElement("input");
  search.type = "text";
  search.id = "todo-search";
  search.placeholder = popupCopy.todoSearch;
  search.value = todoQuery;
  search.addEventListener("input", () => {
    todoQuery = search.value;
    render();
  });
  field.append(label, search);
  if (todosLoading === currentProjectId && todosForProject !== currentProjectId) {
    field.append(el("p", "todo-heading", popupCopy.todoLoading));
    return field;
  }
  if (todoError) field.append(noteLine(todoError, "alert"));
  const needle = todoQuery.trim().toLowerCase();
  const matches = todos.filter((todo) => !needle || todo.title.toLowerCase().includes(needle));
  const exact = todos.find((todo) => todo.title.toLowerCase() === needle);
  field.append(el("p", "todo-heading", popupCopy.todoMine));
  const list = document.createElement("ul");
  list.className = "todo-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", popupCopy.todoMine);
  const none = document.createElement("button");
  none.type = "button";
  none.className = "todo-option";
  none.textContent = popupCopy.todoNone;
  none.setAttribute("role", "option");
  none.setAttribute("aria-selected", todoId ? "false" : "true");
  none.addEventListener("click", () => {
    todoId = "";
    render();
  });
  const noneItem = document.createElement("li");
  noneItem.append(none);
  list.append(noneItem);
  for (const todo of matches) {
    const item = document.createElement("li");
    const option = document.createElement("button");
    option.type = "button";
    option.className = "todo-option";
    option.textContent = todo.title;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", todo.id === todoId ? "true" : "false");
    option.addEventListener("click", () => {
      todoId = todo.id;
      todoQuery = "";
      render();
    });
    item.append(option);
    list.append(item);
  }
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = popupCopy.todoEmpty;
    list.append(empty);
  }
  if (needle && !exact && !todoId) {
    const item = document.createElement("li");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "todo-add";
    add.textContent = `${popupCopy.todoAdd} “${todoQuery.trim()}”`;
    add.addEventListener("click", () => {
      void addTodo(currentProjectId, todoQuery.trim());
    });
    item.append(add);
    list.append(item);
  }
  field.append(list);
  return field;
}

async function addTodo(currentProjectId: string, title: string) {
  if (busy || !title) return;
  busy = true;
  todoError = null;
  render();
  const created = await createTodo({ serverUrl, token }, currentProjectId, title);
  busy = false;
  if (!created.ok) {
    todoError = created.reason === "http" ? created.message : popupCopy.todoFailed;
    render();
    return;
  }
  todos = [...todos.filter((todo) => todo.id !== created.todo.id), created.todo].sort((a, b) =>
    a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
  );
  todoId = created.todo.id;
  todoQuery = "";
  render();
}

function ensureTodos(currentProjectId: string) {
  if (!currentProjectId || todosForProject === currentProjectId || todosLoading === currentProjectId) return;
  todosLoading = currentProjectId;
  void fetchTodos({ serverUrl, token }, currentProjectId).then((result) => {
    if (projectId !== currentProjectId) return;
    todosLoading = "";
    if (!result.ok) {
      todos = [];
      todosForProject = currentProjectId;
      todoError = result.reason === "http" ? result.message : popupCopy.todoFailed;
    } else {
      todos = result.todos;
      todosForProject = currentProjectId;
      todoError = null;
    }
    render();
  });
}

async function onStart() {
  if (busy || !projectId) return;
  busy = true;
  alertMessage = null;
  render();
  let selectedTodo = todoId;
  const draft = todoQuery.trim();
  if (!selectedTodo && draft) {
    const exact = todos.find((todo) => todo.title.toLowerCase() === draft.toLowerCase());
    if (exact) selectedTodo = exact.id;
    else {
      const created = await createTodo({ serverUrl, token }, projectId, draft);
      if (!created.ok) {
        busy = false;
        todoError = created.reason === "http" ? created.message : popupCopy.todoFailed;
        render();
        return;
      }
      selectedTodo = created.todo.id;
      todos = [...todos, created.todo];
      todoId = created.todo.id;
      todoQuery = "";
    }
  }
  const result = await startTimer({ serverUrl, token }, projectId, note.trim(), fetch, selectedTodo);
  busy = false;
  if (result.ok) {
    timer = result.timer;
    note = "";
    projectNotice = null;
    startedHere = true;
    alertMessage = result.warnings[0] ?? null;
    failure = null;
  } else if (result.reason === "already-running") {
    timer = result.timer;
    startedHere = false;
    alertMessage = null;
    failure = null;
  } else if (result.reason === "archived") {
    projectNotice = popupCopy.projectGone;
    projectId = "";
    alertMessage = null;
    await writeSettings({ lastProjectId: "" });
    const refreshed = await fetchProjects({ serverUrl, token });
    if (refreshed.ok) projects = refreshed.projects;
  } else if (result.reason === "missing") {
    projectNotice = popupCopy.projectMissing;
    projectId = "";
    alertMessage = null;
    await writeSettings({ lastProjectId: "" });
    const refreshed = await fetchProjects({ serverUrl, token });
    if (refreshed.ok) projects = refreshed.projects;
  } else if (result.reason === "budget") {
    alertMessage = result.message;
    failure = null;
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
  tone: "primary" | "danger" | "secondary",
  onClick: () => void,
  disabled = false,
) {
  const node = document.createElement("button");
  node.type = "button";
  node.className =
    tone === "danger" ? "button danger" : tone === "secondary" ? "button secondary" : "button primary";
  node.textContent = label;
  node.disabled = disabled;
  node.addEventListener("click", onClick);
  return node;
}

function optionsLink() {
  const link = document.createElement("a");
  link.className = "text-button";
  link.href = chrome.runtime.getURL("options.html");
  link.textContent = popupCopy.openOptions;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  return link;
}

function textButton(label: string, onClick: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "text-button";
  node.textContent = label;
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
