import { describe, expect, it } from "vitest";
import {
  emptyClientFormValues,
  normalizeEmails,
  parseClientFormData,
  validateClientInput,
} from "@/lib/validation";

describe("validateClientInput", () => {
  it("accepts a name and leaves the other fields empty", () => {
    const result = validateClientInput({
      ...emptyClientFormValues,
      name: "  Acme   Studio ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      name: "Acme Studio",
      address: null,
      phone: null,
      emails: [],
    });
  });

  it("requires a name", () => {
    const result = validateClientInput(emptyClientFormValues);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe("Name is required.");
  });

  it("rejects a whitespace-only name", () => {
    const result = validateClientInput({
      ...emptyClientFormValues,
      name: "   \n  ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe("Name is required.");
  });

  it("normalizes every editable field", () => {
    const result = validateClientInput({
      name: "Northwind",
      address: "  100 Market St\nAustin  ",
      phone: " (555) 010-1234 ",
      emails: ["Billing@Northwind.test", "billing@northwind.test"],
      emailDraft: " ops@northwind.test ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      name: "Northwind",
      address: "100 Market St\nAustin",
      phone: "(555) 010-1234",
      emails: ["billing@northwind.test", "ops@northwind.test"],
    });
  });

  it("rejects an invalid email without dropping the draft", () => {
    const result = validateClientInput({
      ...emptyClientFormValues,
      name: "Acme",
      emails: ["ok@acme.test"],
      emailDraft: "not-an-email",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.emails).toMatch(/not a valid email/);
    expect(result.values.emailDraft).toBe("not-an-email");
    expect(result.values.emails).toEqual(["ok@acme.test"]);
  });

  it("rejects an invalid phone number", () => {
    const result = validateClientInput({
      ...emptyClientFormValues,
      name: "Acme",
      phone: "call the office",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.phone).toBeTruthy();
  });

  it("moves a valid draft email onto the list when another field fails", () => {
    const result = validateClientInput({
      ...emptyClientFormValues,
      name: " ",
      emailDraft: "ada@acme.test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.values.emails).toEqual(["ada@acme.test"]);
    expect(result.values.emailDraft).toBe("");
  });
});

describe("normalizeEmails", () => {
  it("caps the list at 20 addresses", () => {
    const emails = Array.from({ length: 21 }, (_, index) => `p${index}@acme.test`);
    expect(normalizeEmails(emails).error).toMatch(/20/);
  });
});

describe("parseClientFormData", () => {
  it("reads repeated email fields and the draft", () => {
    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("address", "1 Main");
    formData.set("phone", "5550100");
    formData.append("emails", "a@acme.test");
    formData.append("emails", "b@acme.test");
    formData.set("emailDraft", "c@acme.test");

    expect(parseClientFormData(formData)).toEqual({
      name: "Acme",
      address: "1 Main",
      phone: "5550100",
      emails: ["a@acme.test", "b@acme.test"],
      emailDraft: "c@acme.test",
    });
  });
});
