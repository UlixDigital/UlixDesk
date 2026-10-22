import { afterEach, describe, expect, it } from "vitest";
import { PROXY_SECRET_HEADER } from "@/lib/trusted-proxy";
import { extensionServerOrigin } from "@/lib/extension-server-origin";

const STAGING = "https://staging.desk.ulixdigital.com";
const PRODUCTION = "https://desk.ulixdigital.com";
const saved = {
  origin: process.env.ULIXDESK_PUBLIC_ORIGIN,
  hosts: process.env.ULIXDESK_APP_HOSTS,
  proxy: process.env.ULIXDESK_TRUSTED_PROXY_SECRET,
};

afterEach(() => {
  restore("ULIXDESK_PUBLIC_ORIGIN", saved.origin);
  restore("ULIXDESK_APP_HOSTS", saved.hosts);
  restore("ULIXDESK_TRUSTED_PROXY_SECRET", saved.proxy);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function request(host: string, extra?: HeadersInit) {
  const headers = new Headers({ host, ...Object.fromEntries(new Headers(extra)) });
  return { url: "http://127.0.0.1:3000/api/extension/download", headers };
}

describe("extension server origin", () => {
  it("uses the configured public origin and ignores the Host header", () => {
    process.env.ULIXDESK_PUBLIC_ORIGIN = `${STAGING}/`;
    expect(extensionServerOrigin(request("evil.test"))).toBe(STAGING);
    process.env.ULIXDESK_PUBLIC_ORIGIN = PRODUCTION;
    expect(extensionServerOrigin(request("staging.desk.ulixdigital.com"))).toBe(PRODUCTION);
  });

  it("does not fall through to Host when the configured origin is not bare", () => {
    process.env.ULIXDESK_PUBLIC_ORIGIN = `${PRODUCTION}/desk`;
    expect(extensionServerOrigin(request("127.0.0.1:3000"))).toBeNull();
  });

  it("accepts a trusted host only when no public origin is configured", () => {
    delete process.env.ULIXDESK_PUBLIC_ORIGIN;
    expect(extensionServerOrigin(request("127.0.0.1:3000"))).toBe("http://127.0.0.1:3000");
    expect(extensionServerOrigin(request("evil.test"))).toBeNull();

    process.env.ULIXDESK_APP_HOSTS = "staging.desk.ulixdigital.com";
    expect(extensionServerOrigin(request("staging.desk.ulixdigital.com"))).toBe(
      "http://staging.desk.ulixdigital.com",
    );
  });

  it("ignores forwarded host and proto unless the proxy secret matches", () => {
    delete process.env.ULIXDESK_PUBLIC_ORIGIN;
    const forwarded = request("127.0.0.1:3000", {
      "x-forwarded-host": "evil.test",
      "x-forwarded-proto": "https",
    });
    expect(extensionServerOrigin(forwarded)).toBe("http://127.0.0.1:3000");

    process.env.ULIXDESK_TRUSTED_PROXY_SECRET = "local-trusted-proxy-secret";
    process.env.ULIXDESK_APP_HOSTS = "staging.desk.ulixdigital.com";
    const trusted = request("127.0.0.1:3000", {
      [PROXY_SECRET_HEADER]: "local-trusted-proxy-secret",
      "x-forwarded-host": "staging.desk.ulixdigital.com",
      "x-forwarded-proto": "https",
    });
    expect(extensionServerOrigin(trusted)).toBe(STAGING);

    const unlisted = request("127.0.0.1:3000", {
      [PROXY_SECRET_HEADER]: "local-trusted-proxy-secret",
      "x-forwarded-host": "evil.test",
      "x-forwarded-proto": "https",
    });
    expect(extensionServerOrigin(unlisted)).toBeNull();
  });
});
