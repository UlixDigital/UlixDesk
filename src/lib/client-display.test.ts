import { describe, expect, it } from "vitest";
import {
  clientCountLabel,
  clientSummary,
  clientsHref,
  emptyStateKind,
  matchingClientsLabel,
  parseClientStatus,
} from "@/lib/client-display";

describe("clientSummary", () => {
  it("describes a client that has no contact details", () => {
    expect(
      clientSummary({ emails: [], phone: null, address: null }),
    ).toBe("No contact details yet");
  });

  it("joins emails, phone, and a single-line address", () => {
    expect(
      clientSummary({
        emails: ["a@acme.test", "b@acme.test", "c@acme.test"],
        phone: "555-0100",
        address: "100 Market\nAustin",
      }),
    ).toBe("a@acme.test, b@acme.test +1 more · 555-0100 · 100 Market Austin");
  });
});

describe("emptyStateKind", () => {
  it("covers an empty directory, an empty archive, and a search miss", () => {
    expect(
      emptyStateKind({
        status: "active",
        query: "",
        visibleCount: 0,
        otherCount: 0,
      }),
    ).toBe("no-clients");

    expect(
      emptyStateKind({
        status: "active",
        query: "",
        visibleCount: 0,
        otherCount: 2,
      }),
    ).toBe("no-active");

    expect(
      emptyStateKind({
        status: "archived",
        query: "  ",
        visibleCount: 0,
        otherCount: 3,
      }),
    ).toBe("no-archived");

    expect(
      emptyStateKind({
        status: "active",
        query: "acme",
        visibleCount: 0,
        otherCount: 0,
      }),
    ).toBe("no-matches");

    expect(
      emptyStateKind({
        status: "archived",
        query: "",
        visibleCount: 1,
        otherCount: 0,
      }),
    ).toBeNull();
  });
});

describe("count labels", () => {
  it("uses the singular when the count is one", () => {
    expect(clientCountLabel(0)).toBe("0 clients");
    expect(clientCountLabel(1)).toBe("1 client");
    expect(clientCountLabel(2)).toBe("2 clients");
  });

  it("pluralizes the search summary the same way", () => {
    expect(matchingClientsLabel(1, "acme")).toBe("1 client matching “acme”");
    expect(matchingClientsLabel(3, "acme")).toBe(
      "3 clients matching “acme”",
    );
  });
});

describe("client links", () => {
  it("keeps the tab and the search query in the href", () => {
    expect(parseClientStatus(undefined)).toBe("active");
    expect(parseClientStatus("nope")).toBe("active");
    expect(parseClientStatus("archived")).toBe("archived");
    expect(clientsHref("active", "  acme  ")).toBe("/clients?q=acme");
    expect(clientsHref("archived", "acme")).toBe(
      "/clients?status=archived&q=acme",
    );
    expect(clientsHref("archived")).toBe("/clients?status=archived");
  });
});
