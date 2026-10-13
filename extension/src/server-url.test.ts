import { describe, expect, it } from "vitest";
import { hostPermissionPattern, isConfigured, normalizeServerUrl } from "./server-url";

describe("server URL", () => {
  it("accepts http and https origins, including a trailing slash", () => {
    expect(normalizeServerUrl("http://127.0.0.1:3000")).toEqual({
      ok: true,
      origin: "http://127.0.0.1:3000",
    });
    expect(normalizeServerUrl(" https://desk.example.com/ ")).toEqual({
      ok: true,
      origin: "https://desk.example.com",
    });
    expect(normalizeServerUrl("http://[::1]:3000/")).toEqual({
      ok: true,
      origin: "http://[::1]:3000",
    });
  });

  it("rejects empty, non-http, credential, and path URLs", () => {
    expect(normalizeServerUrl("  ")).toEqual({ ok: false, reason: "empty" });
    expect(normalizeServerUrl("not a url")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeServerUrl("ftp://files.example")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeServerUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeServerUrl("http://user:pass@127.0.0.1:3000")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(normalizeServerUrl("http://127.0.0.1:3000/ulixdesk")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(normalizeServerUrl("http://127.0.0.1:3000/?token=secret")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("requests only the configured origin", () => {
    expect(hostPermissionPattern("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000/*");
    expect(isConfigured({ serverUrl: " http://127.0.0.1:3000 ", token: " ulixdesk_abc " })).toBe(
      true,
    );
    expect(isConfigured({ serverUrl: "", token: "secret" })).toBe(false);
    expect(isConfigured({ serverUrl: "http://127.0.0.1:3000", token: " " })).toBe(false);
  });
});
