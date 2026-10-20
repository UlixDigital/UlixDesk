import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { createBlankInvoiceAction } from "@/app/invoices/actions";
import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import { toInvoicePdfInput } from "@/lib/invoice-document";
import { dateColumn } from "@/lib/invoice-form";
import { rotateClientLink } from "@/lib/invoice-link";
import { setInvoiceMailTransportForTests } from "@/lib/invoice-mail";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { findPublicInvoice } from "@/lib/invoice-public";
import { loadAgingReport, loadClientInvoiceReport } from "@/lib/invoice-reports";
import { sendInvoice } from "@/lib/invoice-send";
import {
  createBlankInvoice,
  createInvoice,
  deleteDraft,
  getInvoice,
  refreshDraftFromTime,
  saveDraft,
  storedDraft,
} from "@/lib/invoices";
import { reopenInvoice, voidInvoice } from "@/lib/invoice-status";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser, signInAs } from "@/lib/test-actor";
import { setTestSessionToken } from "@/lib/test-hooks";
import { updateManualEntry } from "@/lib/time-entries";
import { addCalendarDays, todayInTimeZone, zonedDayStart } from "@/lib/time-zone";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function workspace() {
  const owner = await createTestUser("owner", "manual-owner@ulix.test");
  const member = await createTestUser("member", "manual-member@ulix.test");
  const client = await prisma.client.create({
    data: { name: "Northwind", currency: "USD", address: "12 Lake Road" },
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
  return { owner, member, client, project };
}

async function addTime(input: { projectId: string; userId: string; day: string; seconds: number }) {
  const startedAt = new Date(zonedDayStart(input.day, "Asia/Colombo").getTime() + 60 * 60 * 1000);
  return prisma.timeEntry.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      startedAt,
      endedAt: new Date(startedAt.getTime() + input.seconds * 1000),
      billable: true,
      source: "manual",
    },
  });
}

function actor(user: { id: string; role: string }) {
  return { id: user.id, role: user.role };
}

describe("blank invoices", () => {
  it("allocates the shared number, uses the client currency and net terms, and does not reuse a deleted number", async () => {
    const { owner, client, project } = await workspace();
    const who = actor(owner);
    const first = await createBlankInvoice({ actor: who, clientId: client.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.number).toBe("LE1176");
    const invoice = await getInvoice(owner.role, first.id);
    const today = todayInTimeZone("Asia/Colombo");
    expect(invoice?.currency).toBe("USD");
    expect(invoice?.status).toBe("draft");
    expect(invoice?.lines).toEqual([]);
    expect(invoice?.totalMinor).toBe(0);
    expect(invoice?.issueDate).toEqual(dateColumn(today));
    expect(invoice?.dueDate).toEqual(dateColumn(addCalendarDays(today, 7)));
    expect(await prisma.invoiceTime.count({ where: { invoiceId: first.id } })).toBe(0);

    await addTime({ projectId: project.id, userId: owner.id, day: "2026-10-06", seconds: 3600 });
    const fromTime = await createInvoice({
      actor: who,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(fromTime.ok).toBe(true);
    if (!fromTime.ok) return;
    expect(fromTime.number).toBe("LE1177");

    expect((await deleteDraft({ actor: who, id: first.id })).ok).toBe(true);
    const third = await createBlankInvoice({ actor: who, clientId: client.id });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.number).toBe("LE1178");
    expect(await prisma.invoiceNumber.findMany({ orderBy: { number: "asc" } })).toEqual([
      expect.objectContaining({ number: "LE1176" }),
      expect.objectContaining({ number: "LE1177" }),
      expect.objectContaining({ number: "LE1178" }),
    ]);
  });

  it("refuses members, and an empty issue is paid with an auto-paid audit row", async () => {
    const { owner, member, client } = await workspace();
    expect((await createBlankInvoice({ actor: actor(member), clientId: client.id })).error).toBe(invoiceCopy.denied);
    expect(await getInvoice(member.role, "missing")).toBeNull();

    const created = await createBlankInvoice({ actor: actor(owner), clientId: client.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invoice = await getInvoice(owner.role, created.id);
    const issued = await saveDraft({ actor: actor(owner), id: created.id, draft: storedDraft(invoice!), issue: true });
    expect(issued.ok).toBe(true);
    const open = await getInvoice(owner.role, created.id);
    expect(open?.status).toBe("paid");
    expect(open?.paidMinor).toBe(0);
    expect(open?.lines).toEqual([]);
    expect(open?.totalMinor).toBe(0);
    const issuedEvents = await prisma.invoiceStatusEvent.findMany({
      where: { invoiceId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(issuedEvents.map((event) => [event.fromStatus, event.toStatus, event.reason])).toEqual([
      ["draft", "open", "Marked as issued"],
      ["open", "paid", invoiceCopy.autoPaid],
    ]);
    expect((await voidInvoice({ actor: actor(owner), id: created.id, reason: "Empty" })).ok).toBe(true);
    expect((await reopenInvoice({ actor: actor(owner), id: created.id, reason: "Edit it" })).ok).toBe(true);
    expect((await getInvoice(owner.role, created.id))?.status).toBe("draft");

    await signInAs("member", "manual-action-member@ulix.test");
    expect((await createBlankInvoiceAction({ error: null, notice: null }, new FormData())).error).toBe(invoiceCopy.denied);
    setTestSessionToken(null);
  });

  it("saves, reorders, and bills manual lines without locking time, then voids and reopens", async () => {
    const { owner, client, project } = await workspace();
    const who = actor(owner);
    const created = await createBlankInvoice({ actor: who, clientId: client.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invoice = await getInvoice(owner.role, created.id);
    const day = invoice!.periodStart.toISOString().slice(0, 10);
    const entry = await addTime({ projectId: project.id, userId: owner.id, day, seconds: 3600 });

    const saved = await saveDraft({
      actor: who,
      id: created.id,
      issue: false,
      draft: {
        ...storedDraft(invoice!),
        discountKind: "percent",
        discountBps: 1000,
        discountAmountMinor: 0,
        taxEnabled: true,
        taxLabel: "VAT",
        taxRateBps: 1000,
        lines: [
          {
            id: null,
            title: "Second",
            detail: "",
            quantitySeconds: 7200,
            quantityMs: 7_200_000n,
            unitPriceMinor: 2500,
            amountMinor: 5000,
            rangeStart: null,
            rangeEnd: null,
          },
          {
            id: null,
            title: "Design",
            detail: "",
            quantitySeconds: 5400,
            quantityMs: 5_400_000n,
            unitPriceMinor: 4000,
            amountMinor: 6000,
            rangeStart: "2026-10-01",
            rangeEnd: "2026-10-03",
          },
        ],
      },
    });
    expect(saved.ok).toBe(true);
    const draft = await getInvoice(owner.role, created.id);
    expect(draft?.lines.map((line) => line.title)).toEqual(["Second", "Design"]);
    expect(draft?.subtotalMinor).toBe(11_000);
    expect(draft?.discountMinor).toBe(1_100);
    expect(draft?.taxMinor).toBe(990);
    expect(draft?.totalMinor).toBe(10_890);
    expect(draft?.lines[1]).toMatchObject({
      kind: "custom",
      quantityMs: 5_400_000n,
      quantitySeconds: 5400,
    });
    expect(draft?.lines[1]?.rangeStart?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(await prisma.invoiceTime.count({ where: { invoiceId: created.id } })).toBe(0);

    const reordered = await saveDraft({
      actor: who,
      id: created.id,
      issue: false,
      draft: {
        ...storedDraft(draft!),
        lines: [...storedDraft(draft!).lines].reverse(),
      },
    });
    expect(reordered.ok).toBe(true);
    expect((await getInvoice(owner.role, created.id))?.lines.map((line) => line.title)).toEqual(["Design", "Second"]);

    expect((await saveDraft({ actor: who, id: created.id, issue: true, draft: storedDraft((await getInvoice(owner.role, created.id))!) })).ok).toBe(true);
    const open = await getInvoice(owner.role, created.id);
    expect(open?.status).toBe("open");
    expect(open?.lines.every((line) => line.kind === "custom")).toBe(true);
    const edited = await updateManualEntry(
      entry.id,
      {
        projectId: project.id,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt!,
        billable: true,
        note: "Still editable",
      },
      new Date("2026-10-20T12:00:00.000Z"),
      owner.id,
    );
    expect(edited?.entry.note).toBe("Still editable");

    expect((await voidInvoice({ actor: who, id: created.id, reason: "Wrong client" })).ok).toBe(true);
    expect((await reopenInvoice({ actor: who, id: created.id, reason: "Put it back" })).ok).toBe(true);
    expect((await getInvoice(owner.role, created.id))?.status).toBe("draft");
  });

  it("adds tracked time without wiping manual lines or billing a slice twice", async () => {
    const { owner, client, project } = await workspace();
    const who = actor(owner);
    await addTime({ projectId: project.id, userId: owner.id, day: "2026-10-06", seconds: 3600 });
    const created = await createInvoice({
      actor: who,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invoice = await getInvoice(owner.role, created.id);
    const timeLine = invoice!.lines[0]!;
    const withManual = await saveDraft({
      actor: who,
      id: created.id,
      issue: false,
      draft: {
        ...storedDraft(invoice!),
        lines: [
          {
            id: null,
            title: "Rush fee",
            detail: "",
            quantitySeconds: 5400,
            quantityMs: 5_400_000n,
            unitPriceMinor: 4000,
            amountMinor: 6000,
            rangeStart: "2026-10-01",
            rangeEnd: "2026-10-03",
          },
          ...storedDraft(invoice!).lines,
        ],
      },
    });
    expect(withManual.ok).toBe(true);
    const mixed = await getInvoice(owner.role, created.id);
    expect(mixed?.lines.map((line) => line.title)).toEqual(["Rush fee", timeLine.title]);

    expect((await refreshDraftFromTime({ actor: who, id: created.id, draft: storedDraft(mixed!) })).ok).toBe(true);
    const refreshed = await getInvoice(owner.role, created.id);
    expect(refreshed?.lines.map((line) => [line.kind, line.title])).toEqual([
      ["time", timeLine.title],
      ["custom", "Rush fee"],
    ]);
    const manual = refreshed?.lines.find((line) => line.kind === "custom");
    expect(manual?.quantityMs).toBe(5_400_000n);
    expect(manual?.amountMinor).toBe(6000);
    expect(manual?.rangeStart?.toISOString().slice(0, 10)).toBe("2026-10-01");
    const links = await prisma.invoiceTime.findMany({ where: { invoiceId: created.id } });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.invoiceLineId !== manual?.id)).toBe(true);

    const again = await createInvoice({
      actor: who,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(again).toMatchObject({ ok: false, error: invoiceCopy.noEligible });
  });

  it("rejects a time-line quantity change and still saves the description and price", async () => {
    const { owner, member, client, project } = await workspace();
    const who = actor(owner);
    await addTime({ projectId: project.id, userId: member.id, day: "2026-10-06", seconds: 3600 });
    const created = await createInvoice({
      actor: who,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invoice = await getInvoice(owner.role, created.id);
    const draft = storedDraft(invoice!);
    const line = draft.lines[0];
    expect(line?.quantitySeconds).toBe(3600);
    if (!line) return;
    const rejected = await saveDraft({
      actor: who,
      id: created.id,
      issue: false,
      draft: {
        ...draft,
        lines: [{ ...line, quantitySeconds: 7200, quantityMs: 7_200_000n, amountMinor: line.unitPriceMinor * 2 }],
      },
    });
    expect(rejected).toEqual({ ok: false, error: invoiceCopy.timeQuantityLocked });
    expect((await getInvoice(owner.role, created.id))?.lines[0]?.quantitySeconds).toBe(3600);

    const priced = await saveDraft({
      actor: who,
      id: created.id,
      issue: false,
      draft: {
        ...draft,
        lines: [{ ...line, title: "Adjusted week", unitPriceMinor: 4000, amountMinor: 1 }],
      },
    });
    expect(priced.ok).toBe(true);
    const saved = await getInvoice(owner.role, created.id);
    expect(saved?.lines[0]?.title).toBe("Adjusted week");
    expect(saved?.lines[0]?.unitPriceMinor).toBe(4000);
    expect(saved?.lines[0]?.quantitySeconds).toBe(3600);
    expect(saved?.lines[0]?.quantityMs).toBe(3_600_000n);
    expect(saved?.lines[0]?.amountMinor).toBe(4000);
    expect(saved?.totalMinor).toBe(4000);
  });

  it("marks a zero-total send as paid, shows that on the report and client page, and can be reopened", async () => {
    const { owner, client } = await workspace();
    const who = actor(owner);
    const created = await createBlankInvoice({ actor: who, clientId: client.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draft = await getInvoice(owner.role, created.id);
    const discounted = await saveDraft({
      actor: who,
      id: created.id,
      issue: false,
      draft: {
        ...storedDraft(draft!),
        discountKind: "percent",
        discountBps: 10_000,
        lines: [
          {
            id: null,
            title: "Courtesy",
            detail: "",
            quantitySeconds: 3600,
            quantityMs: 3_600_000n,
            unitPriceMinor: 4000,
            amountMinor: 4000,
          },
        ],
      },
    });
    expect(discounted.ok).toBe(true);
    setInvoiceMailTransportForTests({
      async send() {
        return undefined;
      },
    });
    try {
      const sent = await sendInvoice({
        actor: who,
        id: created.id,
        to: "billing@northwind.test",
        cc: "",
        subject: "Invoice",
        body: "Nothing is due.",
        confirmIssue: true,
        confirmTime: false,
      });
      expect(sent.ok).toBe(true);
    } finally {
      setInvoiceMailTransportForTests(null);
    }
    const paid = await getInvoice(owner.role, created.id);
    expect(paid?.status).toBe("paid");
    expect(paid?.totalMinor).toBe(0);
    expect(paid?.paidMinor).toBe(0);
    expect(await prisma.invoicePayment.count({ where: { invoiceId: created.id } })).toBe(0);
    const events = await prisma.invoiceStatusEvent.findMany({
      where: { invoiceId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => [event.fromStatus, event.toStatus, event.reason])).toEqual([
      ["draft", "open", "Issued when the invoice was sent"],
      ["open", "paid", invoiceCopy.autoPaid],
    ]);

    const today = todayInTimeZone("Asia/Colombo");
    const report = await loadClientInvoiceReport({
      actor: who,
      today,
      params: { preset: "custom", from: "2026-01-01", to: "2026-12-31", status: "paid" },
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.rows.some((row) => row.number === paid?.number && row.status === "paid" && row.dueMinor === 0)).toBe(true);
    const aging = await loadAgingReport({
      actor: who,
      today,
      params: { preset: "custom", from: "2026-01-01", to: today },
    });
    expect(aging.ok).toBe(true);
    if (!aging.ok) return;
    expect(aging.rows.some((row) => row.clientName === client.name)).toBe(false);

    const link = await rotateClientLink({ actor: who, id: created.id });
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect((await findPublicInvoice(link.token))?.status).toBe("paid");
    const trace: Array<{ text: string }> = [];
    await renderInvoicePdf(
      toInvoicePdfInput({
        companyName: "Ulix Digital",
        companyAddress: "30 North Gould Street",
        number: paid!.number,
        clientName: client.name,
        clientAddress: "",
        currency: paid!.currency,
        issueDate: paid!.issueDate.toISOString().slice(0, 10),
        dueDate: paid!.dueDate.toISOString().slice(0, 10),
        poNumber: null,
        notes: "",
        bankDetails: paid!.bankDetails,
        discountMinor: paid!.discountMinor,
        discountKind: paid!.discountKind,
        discountBps: paid!.discountBps,
        taxEnabled: paid!.taxEnabled,
        taxLabel: paid!.taxLabel,
        taxRateBps: paid!.taxRateBps,
        subtotalMinor: paid!.subtotalMinor,
        taxMinor: paid!.taxMinor,
        totalMinor: paid!.totalMinor,
        paidMinor: paid!.paidMinor,
        paid: true,
        lines: paid!.lines,
      }),
      { compress: false, trace },
    );
    expect(trace.some((item) => item.text === "Status:")).toBe(true);
    expect(trace.some((item) => item.text === "Paid")).toBe(true);

    expect((await reopenInvoice({ actor: who, id: created.id, reason: "Add a charge" })).ok).toBe(true);
    expect((await getInvoice(owner.role, created.id))?.status).toBe("draft");
  });
});
