import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { LOCAL_STACK_INVOICE_LINK_KEYS, invoiceLinkKeyProblem } from "@/lib/invoice-link-guard";

const publicHosts = ["staging.desk.ulixdigital.com", "desk.ulixdigital.com"];
const localHosts = ["", "desk.localhost", "desk.example.com", "staging.desk.localhost"];

describe("invoice link key startup check", () => {
  it("uses the stand-in keys written for the local stack", () => {
    const script = readFileSync(new URL("../../scripts/write-local-stack-env.mjs", import.meta.url), "utf8");
    for (const key of LOCAL_STACK_INVOICE_LINK_KEYS) {
      expect(script).toContain(`INVOICE_LINK_KEY=${key}`);
    }
  });

  it("refuses those stand-ins only when the app host is on ulixdigital.com", () => {
    const realKey = "ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8=";
    for (const key of LOCAL_STACK_INVOICE_LINK_KEYS) {
      for (const hosts of publicHosts) {
        expect(invoiceLinkKeyProblem(key, hosts)).toBe(
          "Refusing the local invoice link key on a public UlixDesk host.",
        );
        expect(invoiceLinkKeyProblem(`  ${key}  `, hosts)).toMatch(/local invoice link key/);
      }
      for (const hosts of localHosts) {
        expect(invoiceLinkKeyProblem(key, hosts)).toBeNull();
      }
    }
    expect(invoiceLinkKeyProblem(realKey, "desk.ulixdigital.com")).toBeNull();
    expect(invoiceLinkKeyProblem("", "desk.ulixdigital.com")).toBeNull();
    expect(invoiceLinkKeyProblem("not-a-key", "staging.desk.ulixdigital.com")).toBeNull();
  });

  it("stops the server at startup for a public host and lets CI hosts through", async () => {
    const saved = {
      key: process.env.INVOICE_LINK_KEY,
      hosts: process.env.ULIXDESK_APP_HOSTS,
      runtime: process.env.NEXT_RUNTIME,
    };
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      process.env.NEXT_RUNTIME = "nodejs";
      process.env.INVOICE_LINK_KEY = LOCAL_STACK_INVOICE_LINK_KEYS[0];
      process.env.ULIXDESK_APP_HOSTS = "staging.desk.ulixdigital.com";
      await expect(register()).rejects.toThrow("exit 1");
      expect(error).toHaveBeenCalledWith("Refusing the local invoice link key on a public UlixDesk host.");

      exit.mockClear();
      process.env.ULIXDESK_APP_HOSTS = "desk.example.com";
      await expect(register()).resolves.toBeUndefined();
      expect(exit).not.toHaveBeenCalled();

      process.env.INVOICE_LINK_KEY = LOCAL_STACK_INVOICE_LINK_KEYS[1];
      delete process.env.ULIXDESK_APP_HOSTS;
      await expect(register()).resolves.toBeUndefined();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
      error.mockRestore();
      if (saved.key === undefined) delete process.env.INVOICE_LINK_KEY;
      else process.env.INVOICE_LINK_KEY = saved.key;
      if (saved.hosts === undefined) delete process.env.ULIXDESK_APP_HOSTS;
      else process.env.ULIXDESK_APP_HOSTS = saved.hosts;
      if (saved.runtime === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = saved.runtime;
    }
  });
});
