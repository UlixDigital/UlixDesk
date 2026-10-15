import { describe, expect, it } from "vitest";
import { popupCopy } from "./copy";
import { describeSignIn } from "./sign-in-state";
import { PRODUCTION_ORIGIN, STAGING_ORIGIN, originForPreset, presetForOrigin } from "./server-url";

describe("extension sign-in", () => {
  it("defaults to production and can point at staging or a custom origin", () => {
    expect(PRODUCTION_ORIGIN).toBe("https://desk.ulixdigital.com");
    expect(STAGING_ORIGIN).toBe("https://staging.desk.ulixdigital.com");
    expect(presetForOrigin(PRODUCTION_ORIGIN)).toBe("production");
    expect(presetForOrigin(STAGING_ORIGIN)).toBe("staging");
    expect(presetForOrigin("http://127.0.0.1:3000")).toBe("custom");
    expect(originForPreset("production", "")).toBe(PRODUCTION_ORIGIN);
    expect(originForPreset("staging", "")).toBe(STAGING_ORIGIN);
    expect(originForPreset("custom", " http://127.0.0.1:3000 ")).toBe("http://127.0.0.1:3000");
  });

  it("uses the same empty-field copy as the web sign-in form", () => {
    expect(describeSignIn({ serverUrl: PRODUCTION_ORIGIN, email: "  ", password: "secret" })).toEqual({
      ok: false,
      message: popupCopy.emailRequired,
    });
    expect(describeSignIn({ serverUrl: PRODUCTION_ORIGIN, email: "not-an-email", password: "secret" })).toEqual({
      ok: false,
      message: popupCopy.emailInvalid,
    });
    expect(describeSignIn({ serverUrl: PRODUCTION_ORIGIN, email: "owner@ulix.test", password: "" })).toEqual({
      ok: false,
      message: popupCopy.passwordRequired,
    });
    expect(describeSignIn({ serverUrl: "notaurl", email: "owner@ulix.test", password: "secret" })).toEqual({
      ok: false,
      message: popupCopy.invalidUrlBody,
    });
    expect(
      describeSignIn({
        serverUrl: "http://127.0.0.1:3000/",
        email: " Owner@Ulix.Test ",
        password: "local-secret",
      }),
    ).toEqual({ ok: true, serverUrl: "http://127.0.0.1:3000", email: "owner@ulix.test" });
  });
});
