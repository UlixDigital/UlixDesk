import { afterEach, describe, expect, it } from "vitest";
import {
  deliverInvoiceMail,
  invoiceMailCanSend,
  invoiceMailConfigured,
  invoiceMessageDefaults,
  parseInvoiceMessage,
  parseRecipientList,
  setInvoiceMailTransportForTests,
  type InvoiceMailMessage,
} from "@/lib/invoice-mail";

const keys = [
  "INVOICE_SMTP_HOST",
  "INVOICE_SMTP_PORT",
  "INVOICE_SMTP_USER",
  "INVOICE_SMTP_PASS",
  "INVOICE_SMTP_FROM",
  "INVOICE_SMTP_FROM_NAME",
] as const;

afterEach(() => {
  setInvoiceMailTransportForTests(null);
  for (const key of keys) delete process.env[key];
});

const message: InvoiceMailMessage = {
  from: "UlixDesk <billing@ulix.test>",
  to: ["a@client.test"],
  cc: ["b@client.test"],
  subject: "Invoice LE1",
  text: "Amount due",
  attachments: [{ filename: "Invoice-LE1.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" }],
};

describe("invoice email", () => {
  it("builds a default that names the invoice, amount, due date, and link", () => {
    const defaults = invoiceMessageDefaults({
      number: "LE1176",
      companyName: "Ulix Digital",
      amountDue: "USD 12.50",
      dueDate: "Mon, Oct 19, 2026",
      clientUrl: "https://desk.example/v/token",
    });
    expect(defaults.subject).toContain("LE1176");
    expect(defaults.body).toContain("USD 12.50");
    expect(defaults.body).toContain("Mon, Oct 19, 2026");
    expect(defaults.body).toContain("https://desk.example/v/token");
  });

  it("accepts several To and Cc addresses and rejects a bad one", () => {
    expect(parseRecipientList("A@Client.test, ops@client.test", "to")).toEqual({
      ok: true,
      emails: ["a@client.test", "ops@client.test"],
    });
    expect(parseRecipientList("", "cc")).toEqual({ ok: true, emails: [] });
    expect(parseRecipientList("", "to").ok).toBe(false);
    expect(parseRecipientList("not-an-email", "cc").ok).toBe(false);
    expect(parseInvoiceMessage("  Hello   there ", "Body").ok).toBe(true);
    expect(parseInvoiceMessage("", "Body").ok).toBe(false);
  });

  it("stays unconfigured until every SMTP value is set, and tests never open a socket", async () => {
    expect(invoiceMailConfigured()).toBe(false);
    expect(invoiceMailCanSend()).toBe(false);
    process.env.INVOICE_SMTP_HOST = "smtp.gmail.com";
    process.env.INVOICE_SMTP_PORT = "587";
    process.env.INVOICE_SMTP_USER = "billing@ulix.test";
    process.env.INVOICE_SMTP_PASS = "app-password";
    process.env.INVOICE_SMTP_FROM = "billing@ulix.test";
    expect(invoiceMailConfigured()).toBe(true);
    expect(invoiceMailCanSend()).toBe(false);
    await expect(deliverInvoiceMail(message)).rejects.toThrow(/SMTP connection from tests/);
  });

  it("captures a message, including the PDF, on the test transport", async () => {
    const captured: InvoiceMailMessage[] = [];
    setInvoiceMailTransportForTests({
      async send(mail) {
        captured.push(mail);
      },
    });
    expect(invoiceMailCanSend()).toBe(true);
    await deliverInvoiceMail(message);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toEqual(["a@client.test"]);
    expect(captured[0]?.cc).toEqual(["b@client.test"]);
    expect(captured[0]?.attachments[0]?.content.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
