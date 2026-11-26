import { describe, expect, it } from "vitest";
import type { ApiProject, ApiTimer } from "./api";
import { popupCopy } from "./copy";
import { clientCaption, derivePopup, failureAfterRefresh, popupChrome, projectOptionLabel } from "./popup-state";

const project: ApiProject = {
  id: "website",
  name: "Website",
  billable: true,
  client: { id: "acme", name: "Acme" },
};
const internal: ApiProject = {
  id: "internal",
  name: "Internal",
  billable: false,
  client: null,
};
const enhancers: ApiProject = {
  id: "enhancers",
  name: "Site care",
  billable: true,
  client: { id: "wsi", name: "WSI Web Enhancers" },
};
const timer: ApiTimer = {
  id: "timer-1",
  projectId: "website",
  projectName: "Website",
  clientName: "Acme",
  startedAt: "2026-10-10T05:00:00.000Z",
  billable: true,
  note: null,
  source: "timer",
};

const base = {
  serverUrl: "http://127.0.0.1:3000",
  token: "ulixdesk_secret",
  permission: true,
  projects: [project] as ApiProject[] | null,
  timer: null as ApiTimer | null,
  failure: null,
  projectId: "website",
  note: "",
  now: Date.parse("2026-10-10T05:01:02.000Z"),
  projectNotice: null,
  startedHere: false,
  alert: null,
  loading: false,
};

describe("popup state", () => {
  it("describes each disconnected and empty state", () => {
    expect(derivePopup({ ...base, loading: true }).kind).toBe("loading");
    expect(derivePopup({ ...base, serverUrl: "", token: "" }).kind).toBe("not-connected");
    expect(derivePopup({ ...base, serverUrl: "notaurl" }).kind).toBe("invalid-url");
    expect(derivePopup({ ...base, permission: false }).kind).toBe("permission");
    const refreshFailure = { ok: false as const, reason: "unreachable" as const };
    expect(
      derivePopup({ ...base, permission: false, projects: null, timer: null, failure: refreshFailure }).kind,
    ).toBe("permission");
    expect(
      derivePopup({ ...base, permission: true, projects: null, timer: null, failure: refreshFailure }).kind,
    ).toBe("unreachable");
    expect(failureAfterRefresh(popupCopy.unexpectedBody)).toEqual({
      ok: false,
      reason: "invalid-response",
      message: popupCopy.unexpectedBody,
    });
    expect(failureAfterRefresh(popupCopy.invalidUrlBody).reason).toBe("invalid-url");
    expect(failureAfterRefresh(popupCopy.unreachableBody)).toEqual({
      ok: false,
      reason: "unreachable",
      message: popupCopy.unreachableBody,
    });
    expect(derivePopup({ ...base, failure: { ok: false, reason: "unreachable" } })).toMatchObject({
      kind: "unreachable",
      message: null,
    });
    expect(
      derivePopup({
        ...base,
        projects: null,
        failure: { ok: false, reason: "unreachable", message: "Database is restarting" },
      }),
    ).toMatchObject({ kind: "unreachable", message: "Database is restarting" });
    expect(
      derivePopup({
        ...base,
        projects: null,
        failure: { ok: false, reason: "unauthorized", message: "no" },
      }).kind,
    ).toBe("unauthorized");
    expect(derivePopup({ ...base, projects: [] }).kind).toBe("no-projects");
  });

  it("shows an already-running timer, including one started outside the popup", () => {
    const model = derivePopup({ ...base, timer });
    expect(model).toMatchObject({
      kind: "running",
      projectName: "Website",
      clientName: "Acme",
      elapsedLabel: "00:01:02",
      status: popupCopy.alreadyRunning,
    });
    expect(derivePopup({ ...base, timer, startedHere: true, alert: "This budget has used 83.3% (alert at 80%)." })).toMatchObject({
      kind: "running",
      status: popupCopy.timerRunning,
      alert: "This budget has used 83.3% (alert at 80%).",
    });
  });

  it("keeps the last project and warns once that an archived choice is gone", () => {
    const idle = derivePopup({ ...base, projectId: "website", note: "Call" });
    expect(idle).toMatchObject({
      kind: "idle",
      projectId: "website",
      note: "Call",
      helper: popupCopy.idle,
      notice: null,
      clientName: "Acme",
    });
    expect(clientCaption("Acme")).toBe("Client Acme");
    expect(projectOptionLabel(project)).toBe("Website · Acme");

    const gone = derivePopup({ ...base, projectId: "old", projectNotice: popupCopy.projectGone });
    expect(gone).toMatchObject({
      kind: "idle",
      projectId: "",
      notice: popupCopy.projectGone,
      helper: popupCopy.chooseProject,
    });

    const onlyChoice = derivePopup({
      ...base,
      projects: [],
      projectId: "old",
      projectNotice: popupCopy.projectGone,
    });
    expect(onlyChoice.kind).toBe("no-projects");
  });

  it("shows the selected project's client and hides a project that has none", () => {
    const selected = derivePopup({
      ...base,
      projects: [internal, project, enhancers],
      projectId: "enhancers",
    });
    expect(selected).toMatchObject({ kind: "idle", projectId: "enhancers", clientName: "WSI Web Enhancers" });
    expect(clientCaption("WSI Web Enhancers")).toBe(`${popupCopy.clientLabel} WSI Web Enhancers`);
    expect(projectOptionLabel(enhancers)).toBe("Site care · WSI Web Enhancers");

    const switched = derivePopup({
      ...base,
      projects: [internal, project, enhancers],
      projectId: "internal",
    });
    expect(switched).toMatchObject({ kind: "idle", projectId: "internal", clientName: null });
    expect(clientCaption(null)).toBeNull();
    expect(projectOptionLabel(internal)).toBe("Internal");

    const blank = derivePopup({
      ...base,
      projects: [{ ...project, client: { id: "acme", name: "  " } }],
      projectId: "website",
    });
    expect(blank).toMatchObject({ kind: "idle", clientName: null });

    const cleared = derivePopup({ ...base, projectId: "" });
    expect(cleared).toMatchObject({ kind: "idle", projectId: "", clientName: null });
  });

  it("keeps the client on a timer that is already running when the popup opens", () => {
    expect(derivePopup({ ...base, timer, projects: null, startedHere: false })).toMatchObject({
      kind: "running",
      projectName: "Website",
      clientName: "Acme",
      status: popupCopy.alreadyRunning,
    });
    expect(
      derivePopup({
        ...base,
        timer: { ...timer, clientName: null },
        startedHere: false,
      }),
    ).toMatchObject({ kind: "running", clientName: null });
    expect(
      derivePopup({
        ...base,
        timer: { ...timer, clientName: "  " },
      }),
    ).toMatchObject({ kind: "running", clientName: null });
  });

  it("does not show the sign-in form before the stored session is known", () => {
    expect(popupChrome({ authResolved: false, signedIn: false })).toBe("pending");
    expect(popupChrome({ authResolved: false, signedIn: true })).toBe("pending");
    expect(popupChrome({ authResolved: true, signedIn: true })).toBe("signed-in");
    expect(popupChrome({ authResolved: true, signedIn: false })).toBe("sign-in");
  });
});
