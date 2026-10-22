import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_FILE as PACKAGED_DEFAULT_SERVER_FILE } from "../default-server.mjs";
import { PRODUCTION_ORIGIN, STAGING_ORIGIN } from "./server-url";
import {
  DEFAULT_SERVER_FILE,
  applyServerSelection,
  serverUrlFromDefaultConfig,
} from "./default-server";

describe("baked server URL", () => {
  it("uses the download's server and does not assume production", () => {
    expect(DEFAULT_SERVER_FILE).toBe(PACKAGED_DEFAULT_SERVER_FILE);
    expect(applyServerSelection("", "")).toEqual({
      serverUrl: "",
      serverPreset: "custom",
      customUrl: "",
    });
    expect(applyServerSelection("", STAGING_ORIGIN)).toEqual({
      serverUrl: STAGING_ORIGIN,
      serverPreset: "staging",
      customUrl: "",
    });
    expect(applyServerSelection("", PRODUCTION_ORIGIN).serverUrl).toBe(PRODUCTION_ORIGIN);
    expect(applyServerSelection("http://127.0.0.1:3000/", STAGING_ORIGIN)).toEqual({
      serverUrl: "http://127.0.0.1:3000",
      serverPreset: "custom",
      customUrl: "http://127.0.0.1:3000",
    });
  });

  it("ignores a config that is not an origin", () => {
    expect(serverUrlFromDefaultConfig(null)).toBe("");
    expect(serverUrlFromDefaultConfig({ serverUrl: "https://desk.ulixdigital.com/path" })).toBe("");
    expect(serverUrlFromDefaultConfig({ serverUrl: STAGING_ORIGIN })).toBe(STAGING_ORIGIN);
    expect(applyServerSelection("", "notaurl").serverUrl).toBe("");
  });
});
