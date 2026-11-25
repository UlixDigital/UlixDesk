import { publicOrigin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientLinkUrl } from "@/lib/invoice-link";
import {
  deliverInvoiceMail,
  formatInvoiceFrom,
  invoiceMailCanSend,
  parseInvoiceMessage,
  parseRecipientList,
  readInvoiceSmtpConfig,
  safeMailError,
} from "@/lib/invoice-mail";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { toQuotationPdfInput } from "@/lib/quotation-document";
import { quotationCopy } from "@/lib/quotation-copy";
import { ensureQuotationLink } from "@/lib/quotation-link";
import { getQuotation, markQuotationSent } from "@/lib/quotations";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { invoiceLinkKeyStatus } from "@/lib/invoice-view-token";
import { utcDateKey } from "@/lib/rates";
import { canManageWorkspace } from "@/lib/users-validation";

type Actor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: quotationCopy.denied };
}

function fail(error: string) {
  return { ok: false as const, error };
}

const SENDABLE = new Set(["draft", "sent"]);

export function quotationMessageDefaults(input: {
  number: string;
  companyName: string;
  total: string;
  validUntil: string;
  clientUrl: string | null;
}) {
  const subject = `Quotation ${input.number} from ${input.companyName}`.slice(0, 200);
  const link = input.clientUrl
    ? `View the quotation: ${input.clientUrl}`
    : "The client link is included here once it has been created.";
  const body = [
    "Hello,",
    "",
    `Quotation ${input.number} for ${input.total} is valid until ${input.validUntil}.`,
    "",
    link,
    "",
    "Thank you,",
    input.companyName,
  ].join("\n");
  return { subject, body };
}

export async function renderStoredQuotationPdf(quotation: NonNullable<Awaited<ReturnType<typeof getQuotation>>>) {
  const settings = await getInvoiceSettings();
  const address = quotation.client.billingAddress?.trim() || quotation.client.address?.trim() || "";
  return renderInvoicePdf(
    toQuotationPdfInput({
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      number: quotation.number,
      clientName: quotation.client.name,
      clientAddress: address,
      currency: quotation.currency,
      issueDate: utcDateKey(quotation.issueDate),
      validUntil: utcDateKey(quotation.validUntil),
      notes: quotation.notes,
      terms: quotation.terms,
      taxEnabled: quotation.taxEnabled,
      taxLabel: quotation.taxLabel,
      taxRateBps: quotation.taxRateBps,
      subtotalMinor: quotation.subtotalMinor,
      taxMinor: quotation.taxMinor,
      totalMinor: quotation.totalMinor,
      lines: quotation.lines,
    }),
  );
}

/**
 * Sending uses the invoice mail transport. A draft is marked sent first, and
 * only when the client link can be sealed. Tests install a capture transport
 * and never open an SMTP socket.
 */
export async function sendQuotation(input: {
  actor: Actor;
  id: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  confirmSend: boolean;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  if (!invoiceMailCanSend()) return { ok: false as const, error: quotationCopy.mailUnconfigured, unconfigured: true as const };

  const to = parseRecipientList(input.to, "to");
  if (!to.ok) return fail(to.error);
  const cc = parseRecipientList(input.cc, "cc");
  if (!cc.ok) return fail(cc.error);
  const message = parseInvoiceMessage(input.subject, input.body);
  if (!message.ok) return fail(message.error);
  const ccOnly = cc.emails.filter((email) => !to.emails.includes(email));

  const existing = await getQuotation(input.actor.role, input.id);
  if (!existing) return fail(quotationCopy.notFound);
  if (!SENDABLE.has(existing.status)) return fail(quotationCopy.sendStatus);
  if (existing.lines.length === 0) return fail(quotationCopy.needsLines);
  if (existing.status === "draft") {
    const keyStatus = invoiceLinkKeyStatus();
    if (keyStatus === "missing") return fail(quotationCopy.linkKeyMissing);
    if (keyStatus === "invalid") return fail(quotationCopy.linkKeyInvalid);
    if (!input.confirmSend) return fail(quotationCopy.sendConfirmIssue);
    const sent = await markQuotationSent({
      actor: input.actor,
      id: input.id,
      reason: quotationCopy.sentByEmail,
    });
    if (!sent.ok) return sent;
  }

  const link = await ensureQuotationLink({ actor: input.actor, id: input.id });
  if (!link.ok) return link;
  const origin = await publicOrigin();
  const url = clientLinkUrl(origin, link.path);
  const quotation = await getQuotation(input.actor.role, input.id);
  if (!quotation) return fail(quotationCopy.notFound);
  const pdf = await renderStoredQuotationPdf(quotation);
  const config = readInvoiceSmtpConfig();
  const from = config ? formatInvoiceFrom(config) : "UlixDesk <quotations@localhost>";
  const payload = {
    from,
    to: to.emails,
    cc: ccOnly,
    subject: message.subject,
    text: message.body.includes(url) ? message.body : `${message.body}\n\nView the quotation: ${url}`,
    attachments: [
      {
        filename: `Quotation-${quotation.number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  };

  try {
    await deliverInvoiceMail(payload);
    await prisma.quotationEmail.create({
      data: {
        quotationId: quotation.id,
        sentById: input.actor.id,
        toAddresses: payload.to,
        ccAddresses: payload.cc,
        subject: payload.subject,
        success: true,
      },
    });
    return { ok: true as const };
  } catch (error) {
    const recorded = safeMailError(error);
    await prisma.quotationEmail.create({
      data: {
        quotationId: quotation.id,
        sentById: input.actor.id,
        toAddresses: payload.to,
        ccAddresses: payload.cc,
        subject: payload.subject,
        success: false,
        error: recorded,
      },
    });
    return fail(quotationCopy.sendFailed);
  }
}
