import { describe, expect, it } from "vitest";
import { accessStillValid } from "./credentials";
import type { ExtensionSettings } from "./storage";

const settings: ExtensionSettings = {
  serverUrl: "https://desk.ulixdigital.com",
  token: "ulixdesk_a_access",
  refreshToken: "ulixdesk_r_refresh",
  accessExpiresAt: "2026-10-14T05:15:00.000Z",
  userName: "Local Owner",
  userEmail: "owner@ulix.local",
  lastProjectId: "",
};

describe("extension credential lifetime", () => {
  it("refreshes a session access token during its last minute and leaves a manual token alone", () => {
    const now = Date.parse("2026-10-14T05:00:00.000Z");
    expect(accessStillValid(settings, now)).toBe(true);
    expect(accessStillValid(settings, Date.parse("2026-10-14T05:14:01.000Z"))).toBe(false);
    expect(accessStillValid({ ...settings, refreshToken: "" }, Date.parse("2026-10-14T06:00:00.000Z"))).toBe(
      true,
    );
  });
});