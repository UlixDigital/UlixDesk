import { describe, expect, it } from "vitest";
import {
  chromeVersion,
  clampBuildNumber,
  isChromeVersion,
  readBuildIdentity,
  stampManifest,
  versionName,
} from "../chrome-version.mjs";

describe("chrome extension version", () => {
  it("appends the build number to the package version", () => {
    expect(chromeVersion({ packageVersion: "0.1.0", buildNumber: 42 })).toBe("0.1.0.42");
    expect(chromeVersion({ packageVersion: "1.2.3", buildNumber: 0 })).toBe("1.2.3.0");
    expect(clampBuildNumber("65536")).toBe(65535);
    expect(chromeVersion({ packageVersion: "0.1.0", buildNumber: 999999 })).toBe("0.1.0.65535");
    expect(clampBuildNumber("")).toBe(0);
    expect(clampBuildNumber("nope")).toBe(0);
    expect(isChromeVersion("0.1.0.42")).toBe(true);
    expect(isChromeVersion("0.1.0.65535")).toBe(true);
    expect(isChromeVersion("0.1.0.65536")).toBe(false);
    expect(isChromeVersion("1.2.3.4.5")).toBe(false);
    expect(isChromeVersion("01.2.0")).toBe(false);
    expect(versionName("0.1.0.42", "abc1234def567890")).toBe("0.1.0.42 (abc1234)");
    expect(versionName("0.1.0.42", "")).toBe("0.1.0.42");
  });

  it("refuses a package version Chrome cannot extend to four parts", () => {
    expect(() => chromeVersion({ packageVersion: "0.1.0.1", buildNumber: 1 })).toThrow(/1 to 3/);
    expect(() => chromeVersion({ packageVersion: "1.2.beta", buildNumber: 1 })).toThrow(/integer/);
  });

  it("stamps version_name with the commit and prefers the env build number", () => {
    const stamped = stampManifest(
      { manifest_version: 3, name: "UlixDesk Timer", version: "0.1.0" },
      { packageVersion: "0.1.0", buildNumber: 7, commit: "deadbeefcafebabe" },
    );
    expect(stamped.version).toBe("0.1.0.7");
    expect(stamped.version_name).toBe("0.1.0.7 (deadbee)");
    expect(stamped.name).toBe("UlixDesk Timer");

    expect(
      readBuildIdentity({
        ULIXDESK_BUILD_NUMBER: "15",
        ULIXDESK_COMMIT: "0123456789abcdef",
        GITHUB_RUN_NUMBER: "99",
        GITHUB_SHA: "ffffffffffffffff",
      }),
    ).toEqual({ buildNumber: 15, commit: "0123456789abcdef" });
  });
});
