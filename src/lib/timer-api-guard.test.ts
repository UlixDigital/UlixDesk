import { describe, expect, it } from "vitest";
import { timeCopy } from "@/lib/time-copy";
import { appOriginsForRequest, timerApiRefusal } from "@/lib/timer-api-guard";

function request(input: { url: string; origin?: string; host?: string; contentType?: string }) {
  const headers: Record<string, string> = {
    "content-type": input.contentType ?? "application/json",
  };
  if (input.origin !== undefined) headers.origin = input.origin;
  if (input.host !== undefined) headers.host = input.host;
  return {
    url: input.url,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  };
}

describe("timer API origin", () => {
  it("accepts the Host header and loopback aliases on the same port", () => {
    const url = "http://localhost:3000/api/timer/start";
    expect(
      timerApiRefusal(
        request({ url, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }),
      ),
    ).toBeNull();
    expect(
      timerApiRefusal(request({ url, host: "localhost:3000", origin: "http://[::1]:3000" })),
    ).toBeNull();
    expect(
      [...appOriginsForRequest(request({ url, host: "127.0.0.1:3000" }))].sort(),
    ).toEqual(
      ["http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:3000"].sort(),
    );

    const refused = timerApiRefusal(
      request({ url, host: "127.0.0.1:3000", origin: "http://127.0.0.1:4000" }),
    );
    expect(refused?.status).toBe(403);
  });

  it("treats a bracketed [::1] host as loopback", () => {
    const url = "http://[::1]:3000/api/timer/start";
    expect(
      timerApiRefusal(
        request({ url, host: "[::1]:3000", origin: "http://127.0.0.1:3000" }),
      ),
    ).toBeNull();
    expect(
      timerApiRefusal(
        request({ url, host: "[::1]:3000", origin: "http://localhost:3000" }),
      ),
    ).toBeNull();
    expect(
      [...appOriginsForRequest(request({ url, host: "[::1]:3000" }))].sort(),
    ).toEqual(
      ["http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:3000"].sort(),
    );

    const otherPort = timerApiRefusal(
      request({ url, host: "[::1]:3000", origin: "http://[::1]:4000" }),
    );
    expect(otherPort?.status).toBe(403);
  });

  it("rejects an untrusted host even when that host matches Origin", async () => {
    const rebound = timerApiRefusal(
      request({
        url: "http://localhost:3000/api/timer/start",
        host: "evil.example",
        origin: "http://evil.example",
      }),
    );
    expect(rebound?.status).toBe(403);
    expect(await rebound?.json()).toEqual({ error: timeCopy.hostForbidden, code: "HOST_FORBIDDEN" });

    const fromUrl = timerApiRefusal(
      request({
        url: "http://evil.example/api/timer/start",
        origin: "http://evil.example",
      }),
    );
    expect(fromUrl?.status).toBe(403);
    expect(await fromUrl?.json()).toEqual({ error: timeCopy.hostForbidden, code: "HOST_FORBIDDEN" });
  });

  it("allows a configured host only when the origin matches it", async () => {
    process.env.ULIXDESK_APP_HOSTS = "https://app.internal:3000";
    try {
      const allowed = timerApiRefusal(
        request({
          url: "http://localhost:3000/api/timer/start",
          host: "app.internal:3000",
          origin: "http://app.internal:3000",
        }),
      );
      expect(allowed).toBeNull();

      const foreign = timerApiRefusal(
        request({
          url: "http://localhost:3000/api/timer/start",
          host: "app.internal:3000",
          origin: "https://evil.test",
        }),
      );
      expect(foreign?.status).toBe(403);
      expect(await foreign?.json()).toEqual({
        error: timeCopy.originForbidden,
        code: "ORIGIN_FORBIDDEN",
      });
    } finally {
      delete process.env.ULIXDESK_APP_HOSTS;
    }
  });
});
