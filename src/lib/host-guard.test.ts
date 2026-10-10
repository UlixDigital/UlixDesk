import { afterEach, describe, expect, it } from "vitest";
import { apiCodes } from "@/lib/api-errors";
import { bearerSkipsHostCheck, hostGuardRefusal } from "@/lib/host-guard";
import { timeCopy } from "@/lib/time-copy";

const previousHosts = process.env.ULIXDESK_APP_HOSTS;

afterEach(() => {
  if (previousHosts === undefined) delete process.env.ULIXDESK_APP_HOSTS;
  else process.env.ULIXDESK_APP_HOSTS = previousHosts;
});

const bearer = `Bearer ulixdesk_${"a".repeat(43)}`;

describe("host guard", () => {
  it("rejects an untrusted host on pages and on the create-token action", async () => {
    const page = hostGuardRefusal({
      pathname: "/settings",
      host: "evil.test:3000",
      authorization: null,
    });
    expect(page?.status).toBe(403);
    expect(page?.headers.get("cache-control")).toBe("no-store");
    expect(await page?.json()).toEqual({
      error: timeCopy.hostForbidden,
      code: apiCodes.HOST_FORBIDDEN,
    });

    const action = hostGuardRefusal({
      pathname: "/settings",
      host: "evil.test:3000",
      authorization: bearer,
    });
    expect(action?.status).toBe(403);
    expect(await action?.json()).toEqual({
      error: timeCopy.hostForbidden,
      code: apiCodes.HOST_FORBIDDEN,
    });
  });

  it("allows loopback and hosts listed in ULIXDESK_APP_HOSTS", () => {
    expect(
      hostGuardRefusal({ pathname: "/settings", host: "127.0.0.1:3000", authorization: null }),
    ).toBeNull();
    expect(
      hostGuardRefusal({ pathname: "/settings", host: "localhost:3000", authorization: null }),
    ).toBeNull();
    expect(
      hostGuardRefusal({ pathname: "/", host: "[::1]:3000", authorization: null }),
    ).toBeNull();

    process.env.ULIXDESK_APP_HOSTS = "desk.example.com";
    expect(
      hostGuardRefusal({
        pathname: "/settings",
        host: "desk.example.com",
        authorization: null,
      }),
    ).toBeNull();
    expect(
      hostGuardRefusal({ pathname: "/clients", host: "evil.test", authorization: null })?.status,
    ).toBe(403);
  });

  it("lets a bearer token skip the host check only on the token routes", () => {
    expect(bearerSkipsHostCheck("/api/projects", bearer)).toBe(true);
    expect(bearerSkipsHostCheck("/api/timer", "bearer token")).toBe(true);
    expect(bearerSkipsHostCheck("/api/timer/start", bearer)).toBe(true);
    expect(bearerSkipsHostCheck("/api/timer/stop", bearer)).toBe(true);
    expect(bearerSkipsHostCheck("/settings", bearer)).toBe(false);
    expect(bearerSkipsHostCheck("/api/projects", "Bearer")).toBe(false);
    expect(bearerSkipsHostCheck("/api/projects", "Basic abc")).toBe(false);
    expect(bearerSkipsHostCheck("/api/projects/extra", bearer)).toBe(false);

    for (const pathname of ["/api/projects", "/api/timer", "/api/timer/start", "/api/timer/stop"]) {
      expect(
        hostGuardRefusal({ pathname, host: "evil.test:3000", authorization: bearer }),
      ).toBeNull();
    }
    expect(
      hostGuardRefusal({
        pathname: "/api/projects",
        host: "evil.test:3000",
        authorization: null,
      })?.status,
    ).toBe(403);
  });
});
