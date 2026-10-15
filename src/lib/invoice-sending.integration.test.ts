import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as publicPdf } from "@/app/v/[token]/pdf/route";
import {
  reopenInvoiceAction,
  sendInvoiceAction,
  voidInvoiceAction,
} from "@/app/invoices/actions";
import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import { readClientLink, revokeClientLink, rotateClientLink } from "@/lib/invoice-link";
import { isSliceConflict } from "@/lib/invoice-lock";
import {
  deliverInvoiceMail,
  setInvoiceMailTransportForTests,
  type InvoiceMailMessage,
} from "@/lib/invoice-mail";
import { findPublicInvoice } from "@/lib/invoice-public";
import { setPublicInvoiceRateLimitForTests } from "@/lib/rate-limit";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createInvoice, getInvoice, saveDraft } from "@/lib/invoices";
import { reopenInvoice, voidInvoice } from "@/lib/invoice-status";
import { sendInvoice } from "@/lib/invoice-send";
import { hashViewToken } from "@/lib/invoice-view-token";
import { createTestUser, signInAs } from "@/lib/test-actor";
import { updateManualEntry } from "@/lib/time-entries";
import { zonedDayStart } from "@/lib/time-zone";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function workspace() {
  const owner = await createTestUser("owner", "send-owner@ulix.test");
  const member = await createTestUser("member", "send-member@ulix.test");
  const client = await prisma.client.create({
    data: {
      name: "WSI Web Enhancers",
      currency: "USD",
      address: "4801 Lang Ave NE",
      emails: { create: [{ email: "billing@wsi.test", position: 0 }, { email: "ap@wsi.test", position: 1 }] },
    },
  });
  const project = await prisma.project.create({
    data: { name: "Website", clientId: client.id, billable: true },
  });
  await prisma.billRate.create({
    data: {
      scope: "client",
      clientId: client.id,
      amountMinor: 2500,
      currency: "USD",
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      createdById: owner.id,
    },
  });
  const startedAt = new Date(zonedDayStart("2026-10-06", "Asia/Colombo").getTime() + 60 * 60 * 1000);
  const entry = await prisma.timeEntry.create({
    data: {
      projectId: project.id,
      userId: member.id,
      startedAt,
      endedAt: new Date(startedAt.getTime() + 3600 * 1000),
      billable: true,
      source: "manual",
    },
  });
  return { owner, member, client, project, entry };
}

async function draftInvoice(owner: { id: string; role: string }, clientId: string) {
  const created = await createInvoice({
    actor: owner,
    clientId,
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    grouping: "period",
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error);
  const invoice = await getInvoice(owner.role, created.id);
  if (!invoice) throw new Error("missing invoice");
  return invoice;
}

function draftOf(invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>) {
  return {
    issueDate: "2026-10-12",
    dueDate: "2026-10-19",
    poNumber: invoice.poNumber,
    notes: invoice.notes,
    bankDetails: invoice.bankDetails,
    discountKind: "none" as const,
    discountAmountMinor: 0,
    discountBps: 0,
    taxEnabled: invoice.taxEnabled,
    taxLabel: invoice.taxLabel,
    taxRateBps: invoice.taxRateBps,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      title: line.title,
      detail: line.detail,
      quantitySeconds: line.quantitySeconds,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: line.amountMinor,
    })),
  };
}

describe("invoice status transitions", () => {
  it("records issue, void, and reopen, and releases the time only on void", async () => {
    const { owner, member, client, project, entry } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    expect((await saveDraft({ actor, id: invoice.id, draft: draftOf(invoice), issue: true })).ok).toBe(true);
    const issued = await prisma.invoiceStatusEvent.findMany({ where: { invoiceId: invoice.id } });
    expect(issued.map((event) => [event.fromStatus, event.toStatus, event.reason, event.actorId])).toEqual([
      ["draft", "open", "Marked as issued", owner.id],
    ]);
    expect(issued[0]?.createdAt).toBeInstanceOf(Date);

    await expect(
      updateManualEntry(
        entry.id,
        { projectId: project.id, startedAt: entry.startedAt, endedAt: entry.endedAt!, billable: true, note: "locked" },
        new Date("2026-10-15T12:00:00.000Z"),
        member.id,
      ),
    ).rejects.toThrow(/INVOICED_TIME/);

    expect((await voidInvoice({ actor, id: invoice.id, reason: "" })).ok).toBe(false);
    expect((await voidInvoice({ actor, id: invoice.id, reason: "Sent in error" })).ok).toBe(true);
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.status).toBe("void");
    expect(await prisma.invoiceTime.count({ where: { invoiceId: invoice.id, active: true } })).toBe(0);
    const edited = await updateManualEntry(
      entry.id,
      { projectId: project.id, startedAt: entry.startedAt, endedAt: entry.endedAt!, billable: true, note: "open again" },
      new Date("2026-10-15T12:00:00.000Z"),
      member.id,
    );
    expect(edited?.entry.note).toBe("open again");

    const again = await createInvoice({
      actor,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(again.ok).toBe(true);
    expect((await reopenInvoice({ actor, id: invoice.id, reason: "Need to fix a line" })).error).toBe(
      invoiceCopy.reopenTaken,
    );

    if (!again.ok) return;
    await prisma.invoiceTime.deleteMany({ where: { invoiceId: again.id } });
    await prisma.invoice.delete({ where: { id: again.id } });
    expect((await reopenInvoice({ actor, id: invoice.id, reason: "Time is free again" })).ok).toBe(true);
    const reopened = await getInvoice(owner.role, invoice.id);
    expect(reopened?.status).toBe("draft");
    expect(await prisma.invoiceTime.count({ where: { invoiceId: invoice.id, active: true } })).toBe(1);
    const events = await prisma.invoiceStatusEvent.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => `${event.fromStatus}->${event.toStatus}`)).toEqual([
      "draft->open",
      "open->void",
      "void->draft",
    ]);
  });

  it("refuses void and reopen once a payment is recorded, and an open reopen keeps the reservation", async () => {
    const { owner, client, entry } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    expect((await saveDraft({ actor, id: invoice.id, draft: draftOf(invoice), issue: true })).ok).toBe(true);
    await prisma.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amountMinor: 100,
        paidOn: new Date("2026-10-20T00:00:00.000Z"),
        recordedById: owner.id,
      },
    });
    expect((await voidInvoice({ actor, id: invoice.id, reason: "Mistake" })).error).toBe(invoiceCopy.voidPayments);
    expect((await reopenInvoice({ actor, id: invoice.id, reason: "Mistake" })).error).toBe(invoiceCopy.reopenPayments);
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: invoice.id } });
    expect((await reopenInvoice({ actor, id: invoice.id, reason: "Still editing" })).ok).toBe(true);
    const second = await createInvoice({
      actor,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(second).toEqual({ ok: false, error: invoiceCopy.noEligible });
    expect(await prisma.invoiceTime.count({ where: { timeEntryId: entry.id, active: true } })).toBe(1);
  });

  it("refuses to reopen a void invoice after the time entry was edited", async () => {
    const { owner, client, entry } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    expect((await saveDraft({ actor, id: invoice.id, draft: draftOf(invoice), issue: true })).ok).toBe(true);
    expect((await voidInvoice({ actor, id: invoice.id, reason: "Hold" })).ok).toBe(true);
    const moved = zonedDayStart("2026-11-02", "Asia/Colombo");
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { startedAt: moved, endedAt: new Date(moved.getTime() + 3600 * 1000) },
    });
    expect((await reopenInvoice({ actor, id: invoice.id, reason: "Put it back" })).error).toBe(
      invoiceCopy.reopenEdited,
    );
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.status).toBe("void");
  });

  it("lets exactly one of two parallel creates bill the same slice", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const input = {
      actor,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period" as const,
    };
    const results = await Promise.all([createInvoice(input), createInvoice(input)]);
    const wins = results.filter((result) => result.ok);
    expect(wins).toHaveLength(1);
    expect(results.some((result) => !result.ok)).toBe(true);
    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.invoiceTime.count({ where: { active: true } })).toBe(1);
  });
});

describe("client invoice link", () => {
  it("refuses a missing or invalid link key and still opens a saved link by hash", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    const saved = process.env.INVOICE_LINK_KEY;
    delete process.env.INVOICE_LINK_KEY;
    try {
      expect(await rotateClientLink({ actor, id: invoice.id })).toEqual({
        ok: false,
        error: invoiceCopy.linkKeyMissing,
      });
      process.env.INVOICE_LINK_KEY = "not-a-key";
      expect(await rotateClientLink({ actor, id: invoice.id })).toEqual({
        ok: false,
        error: invoiceCopy.linkKeyInvalid,
      });
      expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.viewTokenHash).toBeNull();
    } finally {
      process.env.INVOICE_LINK_KEY = saved;
    }

    const created = await rotateClientLink({ actor, id: invoice.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await saveDraft({ actor, id: invoice.id, draft: draftOf(invoice), issue: true })).ok).toBe(true);
    delete process.env.INVOICE_LINK_KEY;
    try {
      expect((await findPublicInvoice(created.token))?.number).toBe(invoice.number);
      expect(await readClientLink(owner.role, invoice.id)).toEqual({
        active: true,
        path: null,
        keyStatus: "missing",
      });
    } finally {
      process.env.INVOICE_LINK_KEY = saved;
    }
  });

  it("stores only the hash, hides drafts, shows void, and 404s after revoke", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    const created = await rotateClientLink({ actor, id: invoice.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.token.length).toBeGreaterThanOrEqual(43);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(row.viewTokenHash).toBe(hashViewToken(created.token));
    expect(row.viewTokenHash).not.toContain(created.token);
    expect(row.viewTokenCipher ?? "").not.toContain(created.token);
    expect(await findPublicInvoice(created.token)).toBeNull();

    expect((await saveDraft({ actor, id: invoice.id, draft: draftOf(invoice), issue: true })).ok).toBe(true);
    const visible = await findPublicInvoice(created.token);
    expect(visible?.number).toBe(invoice.number);
    expect(visible?.status).toBe("open");
    expect(JSON.stringify(visible)).not.toContain(invoice.id);

    expect((await voidInvoice({ actor, id: invoice.id, reason: "Duplicate" })).ok).toBe(true);
    expect((await findPublicInvoice(created.token))?.status).toBe("void");

    expect((await revokeClientLink({ actor, id: invoice.id })).ok).toBe(true);
    expect(await findPublicInvoice(created.token)).toBeNull();
    const missing = await publicPdf(new Request("http://127.0.0.1/v/x/pdf"), {
      params: Promise.resolve({ token: created.token }),
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-robots-tag")).toContain("noindex");
    expect(await findPublicInvoice("not-a-token")).toBeNull();
  });

  it("answers 429 once the public limit is used up", async () => {
    setPublicInvoiceRateLimitForTests(1);
    try {
      const first = await publicPdf(new Request("http://127.0.0.1/v/x/pdf"), {
        params: Promise.resolve({ token: "a".repeat(43) }),
      });
      const second = await publicPdf(new Request("http://127.0.0.1/v/x/pdf"), {
        params: Promise.resolve({ token: "a".repeat(43) }),
      });
      expect(first.status).toBe(404);
      expect(second.status).toBe(429);
      expect(second.headers.get("retry-after")).toBeTruthy();
    } finally {
      setPublicInvoiceRateLimitForTests(60);
    }
  });
});

describe("sending an invoice", () => {
  it("issues a draft, attaches the PDF, and records the recipients", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    const captured: InvoiceMailMessage[] = [];
    setInvoiceMailTransportForTests({
      async send(message) {
        captured.push(message);
      },
    });
    const blocked = await sendInvoice({
      actor,
      id: invoice.id,
      to: "billing@wsi.test",
      cc: "ap@wsi.test",
      subject: `Invoice ${invoice.number}`,
      body: "Please pay.",
      confirmIssue: false,
      confirmTime: false,
    });
    expect(blocked).toEqual({ ok: false, error: invoiceCopy.sendConfirmIssue });

    const sent = await sendInvoice({
      actor,
      id: invoice.id,
      to: "billing@wsi.test, ap@wsi.test",
      cc: "billing@wsi.test, copy@wsi.test",
      subject: `Invoice ${invoice.number}`,
      body: "Please pay.",
      confirmIssue: true,
      confirmTime: false,
    });
    expect(sent.ok).toBe(true);
    expect((await getInvoice(owner.role, invoice.id))?.status).toBe("open");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toEqual(["billing@wsi.test", "ap@wsi.test"]);
    expect(captured[0]?.cc).toEqual(["copy@wsi.test"]);
    expect(captured[0]?.attachments[0]?.filename).toBe(`Invoice-${invoice.number}.pdf`);
    expect(captured[0]?.attachments[0]?.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(captured[0]?.text).toContain("/v/");
    const row = await prisma.invoiceEmail.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(row.success).toBe(true);
    expect(row.sentById).toBe(owner.id);
    expect(row.toAddresses).toEqual(["billing@wsi.test", "ap@wsi.test"]);
    expect(row.ccAddresses).toEqual(["copy@wsi.test"]);
    expect(row.subject).toBe(`Invoice ${invoice.number}`);

    setInvoiceMailTransportForTests({
      async send() {
        throw new Error("mailbox full");
      },
    });
    const failed = await sendInvoice({
      actor,
      id: invoice.id,
      to: "billing@wsi.test",
      cc: "",
      subject: "Retry",
      body: "Trying again.",
      confirmIssue: true,
      confirmTime: false,
    });
    expect(failed).toEqual({ ok: false, error: invoiceCopy.sendFailed });
    const failure = await prisma.invoiceEmail.findFirstOrThrow({
      where: { invoiceId: invoice.id, success: false },
    });
    expect(failure.error).toContain("mailbox full");
    expect(failure.toAddresses).toEqual(["billing@wsi.test"]);
  });

  it("does not send or issue when email is not configured", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const invoice = await draftInvoice(actor, client.id);
    const result = await sendInvoice({
      actor,
      id: invoice.id,
      to: "billing@wsi.test",
      cc: "",
      subject: "Invoice",
      body: "Hello",
      confirmIssue: true,
      confirmTime: false,
    });
    expect(result).toMatchObject({ ok: false, unconfigured: true, error: invoiceCopy.mailUnconfigured });
    expect((await getInvoice(owner.role, invoice.id))?.status).toBe("draft");
    expect(await prisma.invoiceEmail.count()).toBe(0);
    await expect(deliverInvoiceMail({
      from: "a@ulix.test",
      to: ["a@ulix.test"],
      cc: [],
      subject: "nope",
      text: "nope",
      attachments: [],
    })).rejects.toThrow(/SMTP/);
  });

  it("refuses members on every sending action", async () => {
    const { owner, client } = await workspace();
    const invoice = await draftInvoice({ id: owner.id, role: owner.role }, client.id);
    const member = await signInAs("member", "action-member@ulix.test");
    const actor = { id: member.user.id, role: member.user.role };
    expect((await voidInvoice({ actor, id: invoice.id, reason: "no" })).error).toBe(invoiceCopy.denied);
    expect((await reopenInvoice({ actor, id: invoice.id, reason: "no" })).error).toBe(invoiceCopy.denied);
    expect((await rotateClientLink({ actor, id: invoice.id })).error).toBe(invoiceCopy.denied);
    expect((await sendInvoice({
      actor,
      id: invoice.id,
      to: "billing@wsi.test",
      cc: "",
      subject: "Invoice",
      body: "Hello",
      confirmIssue: true,
      confirmTime: false,
    })).error).toBe(invoiceCopy.denied);
    const idle = { error: null, notice: null };
    const form = new FormData();
    form.set("id", invoice.id);
    form.set("reason", "no");
    expect((await voidInvoiceAction(idle, form)).error).toBe(invoiceCopy.denied);
    expect((await reopenInvoiceAction(idle, form)).error).toBe(invoiceCopy.denied);
    form.set("to", "billing@wsi.test");
    form.set("subject", "Invoice");
    form.set("body", "Hello");
    form.set("confirmIssue", "yes");
    expect((await sendInvoiceAction(idle, form)).error).toBe(invoiceCopy.denied);
    expect(await prisma.invoiceEmail.count()).toBe(0);
    expect(await prisma.invoiceStatusEvent.count()).toBe(0);
  });
});

describe("slice conflicts", () => {
  it("recognizes an overlap error", () => {
    expect(isSliceConflict(new Error("InvoiceTime_no_overlap"))).toBe(true);
    expect(isSliceConflict(new Error("other"))).toBe(false);
  });
});
