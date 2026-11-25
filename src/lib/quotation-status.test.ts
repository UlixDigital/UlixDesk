import { describe, expect, it } from "vitest";
import { isPublicPath, sessionGate } from "@/lib/access-decision";
import { quotationDisplayStatus } from "@/lib/quotation-status";

describe("quotation expiry", () => {
  it("expires a draft or sent quotation the day after valid-until, and keeps a decision", () => {
    const today = "2026-11-25";
    expect(quotationDisplayStatus({ status: "draft", validUntil: "2026-11-24", today })).toBe("expired");
    expect(quotationDisplayStatus({ status: "sent", validUntil: "2026-11-24", today })).toBe("expired");
    expect(quotationDisplayStatus({ status: "sent", validUntil: "2026-11-25", today })).toBe("sent");
    expect(quotationDisplayStatus({ status: "draft", validUntil: "2026-12-09", today })).toBe("draft");
    expect(quotationDisplayStatus({ status: "accepted", validUntil: "2026-11-01", today })).toBe("accepted");
    expect(quotationDisplayStatus({ status: "declined", validUntil: "2026-11-01", today })).toBe("declined");
  });

  it("lets a signed-out client open a quotation link", () => {
    const path = "/q/abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
    expect(isPublicPath(path)).toBe(true);
    expect(sessionGate({ pathname: path, hasValidSession: false, isTokenApi: false })).toEqual({ type: "allow" });
    expect(isPublicPath("/quotations")).toBe(false);
  });
});
