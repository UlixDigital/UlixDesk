import { describe, expect, it } from "vitest";
import { isPublicPath, sessionGate } from "@/lib/access-decision";
import {
  VIEW_TOKEN_BYTES,
  InvoiceLinkKeyError,
  clientViewPath,
  decodeInvoiceLinkKey,
  generateViewToken,
  hashViewToken,
  invoiceLinkKeyStatus,
  openViewToken,
  sealViewToken,
  viewTokenBytes,
  viewTokenHashesMatch,
} from "@/lib/invoice-view-token";

const testKey = "ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8=";

describe("invoice view tokens", () => {
  it("is 256 bits, hashed, and sealed so the plaintext can be opened again", () => {
    const token = generateViewToken();
    const other = generateViewToken();
    expect(token).not.toBe(other);
    expect(viewTokenBytes(token)?.length).toBe(VIEW_TOKEN_BYTES);
    expect(VIEW_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(128);
    expect(viewTokenBytes("short")).toBeNull();
    expect(viewTokenBytes(`${token}x`)).toBeNull();
    const hash = hashViewToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(viewTokenHashesMatch(hash, hash)).toBe(true);
    expect(viewTokenHashesMatch(hash, hashViewToken(other))).toBe(false);
    const sealed = sealViewToken(token);
    expect(sealed.cipher).not.toContain(token);
    expect(openViewToken(sealed.nonce, sealed.cipher)).toBe(token);
    expect(openViewToken(sealed.nonce, sealed.cipher.slice(0, -2) + "aa")).toBeNull();
    expect(clientViewPath(token)).toBe(`/v/${token}`);
  });

  it("lets the client link through without a session", () => {
    const token = generateViewToken();
    expect(isPublicPath(`/v/${token}`)).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/health/live")).toBe(true);
    expect(sessionGate({ pathname: `/v/${token}`, hasValidSession: false, isTokenApi: false })).toEqual({
      type: "allow",
    });
    expect(isPublicPath("/invoices")).toBe(false);
    expect(sessionGate({ pathname: "/api/health", hasValidSession: false, isTokenApi: false })).toEqual({
      type: "allow",
    });
  });

  it("accepts base64 and hex, and refuses a missing or invalid key", () => {
    const saved = process.env.INVOICE_LINK_KEY;
    const token = generateViewToken();
    try {
      process.env.INVOICE_LINK_KEY = testKey;
      expect(invoiceLinkKeyStatus()).toBe("ok");
      expect(decodeInvoiceLinkKey(testKey)?.length).toBe(32);
      const sealed = sealViewToken(token);
      const hex = decodeInvoiceLinkKey(testKey)!.toString("hex");
      expect(hex).toHaveLength(64);
      process.env.INVOICE_LINK_KEY = hex;
      expect(invoiceLinkKeyStatus()).toBe("ok");
      expect(openViewToken(sealed.nonce, sealed.cipher)).toBe(token);

      delete process.env.INVOICE_LINK_KEY;
      expect(invoiceLinkKeyStatus()).toBe("missing");
      expect(() => sealViewToken(token)).toThrow(InvoiceLinkKeyError);
      expect(openViewToken(sealed.nonce, sealed.cipher)).toBeNull();

      process.env.INVOICE_LINK_KEY = "not-a-key";
      expect(invoiceLinkKeyStatus()).toBe("invalid");
      expect(() => sealViewToken(token)).toThrow(InvoiceLinkKeyError);
      expect(openViewToken(sealed.nonce, sealed.cipher)).toBeNull();

      process.env.INVOICE_LINK_KEY = `${hex.slice(0, -1)}0`;
      expect(openViewToken(sealed.nonce, sealed.cipher)).toBeNull();
    } finally {
      process.env.INVOICE_LINK_KEY = saved;
    }
  });
});
