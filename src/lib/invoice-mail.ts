import nodemailer from "nodemailer";
import { invoiceCopy } from "@/lib/invoice-copy";
import { validateEmail } from "@/lib/users-validation";

export const INVOICE_EMAIL_SUBJECT_MAX = 200;
export const INVOICE_EMAIL_BODY_MAX = 5000;
export const INVOICE_EMAIL_RECIPIENT_MAX = 20;

export type InvoiceMailMessage = {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
};

export type InvoiceMailTransport = {
  send(message: InvoiceMailMessage): Promise<void>;
};

export class InvoiceMailUnconfiguredError extends Error {
  constructor() {
    super(invoiceCopy.mailUnconfigured);
    this.name = "InvoiceMailUnconfiguredError";
  }
}

let testTransport: InvoiceMailTransport | null = null;

/** Tests install this. Production never does, and Vitest refuses a real SMTP socket. */
export function setInvoiceMailTransportForTests(transport: InvoiceMailTransport | null) {
  if (process.env.VITEST !== "true") {
    throw new Error("The invoice mail transport can only be replaced in tests.");
  }
  testTransport = transport;
}

export function invoiceMailTestTransport() {
  return testTransport;
}

export type InvoiceSmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
};

function envValue(name: string) {
  const value = process.env[name]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

/** Blank or missing values mean email is off. The copy-link control stays available. */
export function readInvoiceSmtpConfig(): InvoiceSmtpConfig | null {
  const host = envValue("INVOICE_SMTP_HOST");
  const portRaw = envValue("INVOICE_SMTP_PORT");
  const user = envValue("INVOICE_SMTP_USER");
  const pass = envValue("INVOICE_SMTP_PASS");
  const from = envValue("INVOICE_SMTP_FROM");
  const fromName = envValue("INVOICE_SMTP_FROM_NAME") ?? "";
  if (!host || !portRaw || !user || !pass || !from) return null;
  if (!/^\d+$/.test(portRaw)) return null;
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!validateEmail(from).ok) return null;
  return { host, port, user, pass, from, fromName };
}

export function invoiceMailConfigured() {
  return readInvoiceSmtpConfig() !== null;
}

/**
 * True when a test double is installed, or when SMTP is configured outside Vitest.
 * Tests cannot fall through to the network even if the SMTP variables are set.
 */
export function invoiceMailCanSend() {
  if (testTransport) return true;
  if (process.env.VITEST === "true") return false;
  return invoiceMailConfigured();
}

export function formatInvoiceFrom(config: InvoiceSmtpConfig) {
  if (!config.fromName) return config.from;
  const name = config.fromName.replace(/["\r\n]/g, "");
  return `"${name}" <${config.from}>`;
}

export function invoiceMessageDefaults(input: {
  number: string;
  companyName: string;
  amountDue: string;
  dueDate: string;
  clientUrl: string | null;
}) {
  const subject = `Invoice ${input.number} from ${input.companyName}`.slice(0, INVOICE_EMAIL_SUBJECT_MAX);
  const link = input.clientUrl
    ? `View the invoice: ${input.clientUrl}`
    : "The client link is included here once it has been created.";
  const body = [
    "Hello,",
    "",
    `Invoice ${input.number} for ${input.amountDue} is due on ${input.dueDate}.`,
    "",
    link,
    "",
    "Thank you,",
    input.companyName,
  ].join("\n");
  return { subject, body };
}

export function parseRecipientList(
  raw: string,
  field: "to" | "cc",
): { ok: true; emails: string[] } | { ok: false; error: string } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const parsed = validateEmail(part);
    if (!parsed.ok) {
      return { ok: false, error: field === "to" ? invoiceCopy.toInvalid : invoiceCopy.ccInvalid };
    }
    if (seen.has(parsed.email)) continue;
    seen.add(parsed.email);
    emails.push(parsed.email);
  }
  if (emails.length > INVOICE_EMAIL_RECIPIENT_MAX) {
    return { ok: false, error: field === "to" ? invoiceCopy.toTooMany : invoiceCopy.ccTooMany };
  }
  if (field === "to" && emails.length === 0) return { ok: false, error: invoiceCopy.toRequired };
  return { ok: true, emails };
}

export function parseInvoiceMessage(subjectRaw: string, bodyRaw: string) {
  const subject = subjectRaw.replace(/\s+/g, " ").trim();
  const body = bodyRaw.replace(/\r\n/g, "\n");
  if (!subject) return { ok: false as const, error: invoiceCopy.subjectRequired };
  if (subject.length > INVOICE_EMAIL_SUBJECT_MAX) return { ok: false as const, error: invoiceCopy.subjectTooLong };
  if (!body.trim()) return { ok: false as const, error: invoiceCopy.bodyRequired };
  if (body.length > INVOICE_EMAIL_BODY_MAX) return { ok: false as const, error: invoiceCopy.bodyTooLong };
  return { ok: true as const, subject, body };
}

function smtpTransport(config: InvoiceSmtpConfig): InvoiceMailTransport {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: { user: config.user, pass: config.pass },
  });
  return {
    async send(message) {
      await transport.sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc.length > 0 ? message.cc : undefined,
        subject: message.subject,
        text: message.text,
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      });
    },
  };
}

export function safeMailError(error: unknown) {
  const pass = process.env.INVOICE_SMTP_PASS ?? "";
  let text = error instanceof Error ? error.message : "Email could not be sent.";
  if (pass) text = text.split(pass).join("[redacted]");
  return text.slice(0, 500);
}

/**
 * Sends through the test double when one is installed.
 * Otherwise uses SMTP. Vitest throws instead of opening a socket.
 */
export async function deliverInvoiceMail(message: InvoiceMailMessage) {
  if (testTransport) {
    await testTransport.send(message);
    return;
  }
  if (process.env.VITEST === "true") {
    throw new Error("Refusing to open an SMTP connection from tests.");
  }
  const config = readInvoiceSmtpConfig();
  if (!config) throw new InvoiceMailUnconfiguredError();
  await smtpTransport(config).send(message);
}
