import { describe, expect, it } from "vitest";
import type { ApiProject, ApiTimer } from "./api";
import { popupCopy } from "./copy";
import { derivePopup, projectOptionLabel } from "./popup-state";

const project: ApiProject = {
  id: "website",
  name: "Website",
  billable: true,
  client: { id: "acme", name: "Acme" },
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
  archivedNotice: false,
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
    expect(derivePopup({ ...base, failure: { ok: false, reason: "unreachable" } }).kind).toBe(
      "unreachable",
    );
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
    expect(derivePopup({ ...base, timer, startedHere: true })).toMatchObject({
      kind: "running",
      status: popupCopy.timerRunning,
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
    });
    expect(projectOptionLabel(project)).toBe("Website · Acme");

    const gone = derivePopup({ ...base, projectId: "old", archivedNotice: true });
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
      archivedNotice: true,
    });
    expect(onlyChoice.kind).toBe("no-projects");
  });
});
