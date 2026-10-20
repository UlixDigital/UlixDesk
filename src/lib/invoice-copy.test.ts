import { describe, expect, it } from "vitest";
import { invoiceCopy, showInvoiceHistoryPanels } from "@/lib/invoice-copy";

describe("invoice copy", () => {
  it("says the send, link, and reopen notes in plain words", () => {
    const shown = [
      invoiceCopy.mailUnconfigured,
      invoiceCopy.clientLinkHint,
      invoiceCopy.reopenRules,
      invoiceCopy.linkKeyMissing,
      invoiceCopy.linkKeyInvalid,
      invoiceCopy.linkKeyMissingShow,
      invoiceCopy.linkKeyInvalidShow,
    ].join("\n");
    expect(shown).not.toMatch(/SMTP|not-found|slice|openssl|base64/i);
    expect(invoiceCopy.mailUnconfigured).toBe(
      "Email is not set up. Add the email settings to send. Copy link still works.",
    );
    expect(invoiceCopy.clientLinkHint).toContain("makes the old link stop working");
    expect(invoiceCopy.reopenRules).toContain("the billed time still matches those entries");
    expect(invoiceCopy.reopenRules).toContain("has not been billed on another invoice");
  });
});

describe("invoice history panels", () => {
  it("hides both panels on a blank draft and shows them once something happened", () => {
    expect(showInvoiceHistoryPanels("draft", 0, 0)).toBe(false);
    expect(showInvoiceHistoryPanels("draft", 1, 0)).toBe(true);
    expect(showInvoiceHistoryPanels("draft", 0, 1)).toBe(true);
    expect(showInvoiceHistoryPanels("open", 0, 0)).toBe(true);
    expect(showInvoiceHistoryPanels("void", 2, 0)).toBe(true);
  });
});
