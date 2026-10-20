import { publicOrigin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import { clientLinkKeyMessage, clientLinkUrl, ensureClientLink, readClientLink } from "@/lib/invoice-link";
import {
  deliverInvoiceMail,
  formatInvoiceFrom,
  invoiceMailCanSend,
  parseInvoiceMessage,
  parseRecipientList,
  readInvoiceSmtpConfig,
  safeMailError,
} from "@/lib/invoice-mail";
import { renderStoredInvoicePdf } from "@/lib/invoice-render";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { invoiceLinkKeyStatus } from "@/lib/invoice-view-token";
import { getInvoice, issueSavedDraft } from "@/lib/invoices";
import { canManageWorkspace } from "@/lib/users-validation";

type Actor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: invoiceCopy.denied };
}

function fail(error: string) {
  return { ok: false as const, error };
}

const SENDABLE = new Set(["draft", "open", "paid", "partially_paid"]);

/**
 * Sending a draft issues it first, and only when the client link can be
 * sealed. A missing or invalid INVOICE_LINK_KEY refuses the send and leaves
 * the draft as a draft. Mark as issued on its own does not need the key.
 * The caller must pass confirmIssue, and confirmTime when the tracked time
 * has changed since the draft was saved. A void invoice cannot be emailed.
 * A failed delivery is recorded and does not roll the issue back.
 */
export async function sendInvoice(input: {
  actor: Actor;
  id: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  confirmIssue: boolean;
  confirmTime: boolean;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  if (!invoiceMailCanSend()) return { ok: false as const, error: invoiceCopy.mailUnconfigured, unconfigured: true as const };

  const to = parseRecipientList(input.to, "to");
  if (!to.ok) return fail(to.error);
  const cc = parseRecipientList(input.cc, "cc");
  if (!cc.ok) return fail(cc.error);
  const ccOnly = cc.emails.filter((email) => !to.emails.includes(email));
  const message = parseInvoiceMessage(input.subject, input.body);
  if (!message.ok) return fail(message.error);

  const existing = await getInvoice(input.actor.role, input.id);
  if (!existing) return fail(invoiceCopy.notFound);
  if (existing.status === "void") return fail(invoiceCopy.sendVoid);
  if (!SENDABLE.has(existing.status)) return fail(invoiceCopy.sendStatus);
  if (existing.status === "draft") {
    const keyStatus = invoiceLinkKeyStatus();
    if (keyStatus === "missing") return fail(invoiceCopy.linkKeyMissing);
    if (keyStatus === "invalid") return fail(invoiceCopy.linkKeyInvalid);
    const currentLink = await readClientLink(input.actor.role, input.id);
    if (currentLink?.active && !currentLink.path) {
      return fail(clientLinkKeyMessage(currentLink.keyStatus === "ok" ? "mismatch" : currentLink.keyStatus));
    }
    if (!input.confirmIssue) return fail(invoiceCopy.sendConfirmIssue);
    const issued = await issueSavedDraft({
      actor: input.actor,
      id: input.id,
      confirm: input.confirmTime,
      reason: "Issued when the invoice was sent",
    });
    if (!issued.ok && "confirm" in issued && issued.confirm) {
      return { ok: false as const, confirm: true as const, diffs: issued.diffs };
    }
    if (!issued.ok) return issued;
  }

  const link = await ensureClientLink({ actor: input.actor, id: input.id });
  if (!link.ok) return link;
  const origin = await publicOrigin();
  const url = clientLinkUrl(origin, link.path);
  const invoice = await getInvoice(input.actor.role, input.id);
  if (!invoice) return fail(invoiceCopy.notFound);
  const settings = await getInvoiceSettings();
  const address = invoice.client.billingAddress?.trim() || invoice.client.address?.trim() || "";
  const pdf = await renderStoredInvoicePdf({
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    number: invoice.number,
    clientName: invoice.client.name,
    clientAddress: address,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    poNumber: invoice.poNumber,
    notes: invoice.notes,
    bankDetails: invoice.bankDetails,
    discountMinor: invoice.discountMinor,
    discountKind: invoice.discountKind,
    discountBps: invoice.discountBps,
    taxEnabled: invoice.taxEnabled,
    taxLabel: invoice.taxLabel,
    taxRateBps: invoice.taxRateBps,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    paidMinor: invoice.paidMinor,
    status: invoice.status,
    lines: invoice.lines,
  });

  const config = readInvoiceSmtpConfig();
  const from = config ? formatInvoiceFrom(config) : "UlixDesk <invoices@localhost>";
  const payload = {
    from,
    to: to.emails,
    cc: ccOnly,
    subject: message.subject,
    text: message.body.includes(url) ? message.body : `${message.body}\n\nView the invoice: ${url}`,
    attachments: [
      {
        filename: `Invoice-${invoice.number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  };

  try {
    await deliverInvoiceMail(payload);
    await prisma.invoiceEmail.create({
      data: {
        invoiceId: invoice.id,
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
    await prisma.invoiceEmail.create({
      data: {
        invoiceId: invoice.id,
        sentById: input.actor.id,
        toAddresses: payload.to,
        ccAddresses: payload.cc,
        subject: payload.subject,
        success: false,
        error: recorded,
      },
    });
    return fail(invoiceCopy.sendFailed);
  }
}
