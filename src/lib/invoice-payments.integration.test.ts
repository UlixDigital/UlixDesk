import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { invoiceBalance } from "@/lib/invoice-balance";
import { invoiceCopy } from "@/lib/invoice-copy";
import { dateColumn } from "@/lib/invoice-form";
import { correctPayment, deletePayment, recordPayment } from "@/lib/invoice-payments";
import { reopenInvoice, voidInvoice } from "@/lib/invoice-status";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openInvoice(input?: { totalMinor?: number }) {
  const owner = await createTestUser("owner", "pay-owner@ulix.test");
  const admin = await createTestUser("admin", "pay-admin@ulix.test");
  const member = await createTestUser("member", "pay-member@ulix.test");
  const client = await prisma.client.create({ data: { name: "WSI Web Enhancers", currency: "USD" } });
  const totalMinor = input?.totalMinor ?? 10000;
  const invoice = await prisma.invoice.create({
    data: {
      number: "LE2001",
      clientId: client.id,
      status: "open",
      currency: "USD",
      issueDate: dateColumn("2026-09-01"),
      dueDate: dateColumn("2026-09-15"),
      periodStart: dateColumn("2026-09-01"),
      periodEnd: dateColumn("2026-09-07"),
      grouping: "period",
      notes: "",
      bankDetails: "Beneficiary Name: Ulix Digital",
      subtotalMinor: totalMinor,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor,
      paidMinor: 0,
      createdById: owner.id,
      issuedAt: new Date("2026-09-01T00:00:00.000Z"),
      lines: {
        create: {
          position: 0,
          kind: "custom",
          title: "September work",
          quantitySeconds: 3600,
          unitPriceMinor: totalMinor,
          amountMinor: totalMinor,
        },
      },
    },
  });
  return { owner, admin, member, client, invoice };
}

function actor(user: { id: string; role: string }) {
  return { id: user.id, role: user.role };
}

describe("recording payments", () => {
  it("records a partial payment, then a final payment, and keeps paid plus due equal to the total", async () => {
    const { owner, invoice } = await openInvoice();
    const partial = await recordPayment({
      actor: actor(owner),
      invoiceId: invoice.id,
      amount: "40.00",
      paidOn: "2026-10-01",
      method: "bank_transfer",
      note: "First wire",
    });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.status).toBe("open");
    expect(invoiceBalance(partial.totalMinor, partial.paidMinor)).toMatchObject({
      paidMinor: 4000,
      dueMinor: 6000,
      balanced: true,
    });
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
    expect(stored.status).toBe("open");
    expect(stored.payments).toHaveLength(1);
    expect(stored.payments[0]?.recordedById).toBe(owner.id);
    expect(stored.payments[0]?.method).toBe("bank_transfer");

    const rest = await recordPayment({
      actor: actor(owner),
      invoiceId: invoice.id,
      amount: "60.00",
      paidOn: "2026-10-15",
      method: "card",
      note: "",
    });
    expect(rest.ok).toBe(true);
    if (!rest.ok) return;
    expect(rest.status).toBe("paid");
    expect(invoiceBalance(rest.totalMinor, rest.paidMinor).balanced).toBe(true);
    expect(rest.dueMinor).toBe(0);
    const events = await prisma.invoiceStatusEvent.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => `${event.fromStatus}->${event.toStatus}`)).toEqual(["open->open", "open->paid"]);
    expect(events[0]?.reason).toContain("Recorded USD 40.00");
    expect(events[0]?.actorId).toBe(owner.id);
  });

  it("refuses an overpayment and leaves the invoice unchanged", async () => {
    const { owner, invoice } = await openInvoice();
    await recordPayment({
      actor: actor(owner),
      invoiceId: invoice.id,
      amount: "40.00",
      paidOn: "2026-10-01",
      method: "cash",
      note: "",
    });
    const over = await recordPayment({
      actor: actor(owner),
      invoiceId: invoice.id,
      amount: "60.01",
      paidOn: "2026-10-02",
      method: "cash",
      note: "",
    });
    expect(over).toEqual({ ok: false, error: invoiceCopy.paymentOverpay });
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidMinor).toBe(4000);
    expect(stored.status).toBe("open");
    expect(await prisma.invoicePayment.count()).toBe(1);
  });

  it("refuses a payment that only exceeds the balance when combined with one already in flight", async () => {
    const { owner, invoice } = await openInvoice();
    const [first, second] = await Promise.all([
      recordPayment({
        actor: actor(owner),
        invoiceId: invoice.id,
        amount: "60.00",
        paidOn: "2026-10-01",
        method: "check",
        note: "",
      }),
      recordPayment({
        actor: actor(owner),
        invoiceId: invoice.id,
        amount: "60.00",
        paidOn: "2026-10-01",
        method: "check",
        note: "",
      }),
    ]);
    const results = [first, second];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => result.error)).toEqual([invoiceCopy.paymentOverpay]);
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidMinor).toBe(6000);
    expect(invoiceBalance(stored.totalMinor, stored.paidMinor).balanced).toBe(true);
  });

  it("lets an admin record a payment and refuses a member", async () => {
    const { admin, member, invoice } = await openInvoice();
    expect(
      (
        await recordPayment({
          actor: actor(member),
          invoiceId: invoice.id,
          amount: "1.00",
          paidOn: "2026-10-01",
          method: "cash",
          note: "",
        })
      ).error,
    ).toBe(invoiceCopy.denied);
    expect(await prisma.invoicePayment.count()).toBe(0);
    expect(
      (
        await recordPayment({
          actor: actor(admin),
          invoiceId: invoice.id,
          amount: "1.00",
          paidOn: "2026-10-01",
          method: "other",
          note: "",
        })
      ).ok,
    ).toBe(true);
  });

  it("refuses payments on a draft or a void invoice", async () => {
    const { owner, invoice } = await openInvoice();
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "draft", issuedAt: null } });
    expect(
      (
        await recordPayment({
          actor: actor(owner),
          invoiceId: invoice.id,
          amount: "1.00",
          paidOn: "2026-10-01",
          method: "cash",
          note: "",
        })
      ).error,
    ).toBe(invoiceCopy.paymentStatus);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "void" } });
    expect(
      (
        await recordPayment({
          actor: actor(owner),
          invoiceId: invoice.id,
          amount: "1.00",
          paidOn: "2026-10-01",
          method: "cash",
          note: "",
        })
      ).error,
    ).toBe(invoiceCopy.paymentStatus);
  });

  it("corrects and deletes a payment, returns a paid invoice to open, and then allows void", async () => {
    const { owner, invoice } = await openInvoice();
    const who = actor(owner);
    expect(
      (
        await recordPayment({
          actor: who,
          invoiceId: invoice.id,
          amount: "100.00",
          paidOn: "2026-10-01",
          method: "bank_transfer",
          note: "full",
        })
      ).ok,
    ).toBe(true);
    expect((await voidInvoice({ actor: who, id: invoice.id, reason: "Too soon" })).error).toBe(invoiceCopy.voidStatus);
    expect((await reopenInvoice({ actor: who, id: invoice.id, reason: "Too soon" })).error).toBe(invoiceCopy.reopenStatus);

    const payment = await prisma.invoicePayment.findFirstOrThrow();
    const corrected = await correctPayment({
      actor: who,
      invoiceId: invoice.id,
      paymentId: payment.id,
      amount: "25.00",
      paidOn: "2026-10-02",
      method: "card",
      note: "short",
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.status).toBe("open");
    expect(invoiceBalance(corrected.totalMinor, corrected.paidMinor)).toMatchObject({ paidMinor: 2500, dueMinor: 7500 });
    expect((await voidInvoice({ actor: who, id: invoice.id, reason: "Still paid" })).error).toBe(invoiceCopy.voidPayments);
    expect((await reopenInvoice({ actor: who, id: invoice.id, reason: "Still paid" })).error).toBe(
      invoiceCopy.reopenPayments,
    );

    const tooMuch = await correctPayment({
      actor: who,
      invoiceId: invoice.id,
      paymentId: payment.id,
      amount: "100.01",
      paidOn: "2026-10-02",
      method: "card",
      note: "",
    });
    expect(tooMuch).toEqual({ ok: false, error: invoiceCopy.paymentOverpay });

    expect((await deletePayment({ actor: who, invoiceId: invoice.id, paymentId: payment.id })).ok).toBe(true);
    const cleared = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(cleared.status).toBe("open");
    expect(cleared.paidMinor).toBe(0);
    expect(invoiceBalance(cleared.totalMinor, cleared.paidMinor).balanced).toBe(true);
    expect((await voidInvoice({ actor: who, id: invoice.id, reason: "No longer paid" })).ok).toBe(true);
    const events = await prisma.invoiceStatusEvent.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.reason).join("\n")).toContain("Deleted a payment of USD 25.00");
    expect(events.map((event) => `${event.fromStatus}->${event.toStatus}`)).toContain("paid->open");
  });

  it("refuses another payment once the invoice is paid", async () => {
    const { owner, invoice } = await openInvoice();
    await recordPayment({
      actor: actor(owner),
      invoiceId: invoice.id,
      amount: "100.00",
      paidOn: "2026-10-01",
      method: "cash",
      note: "",
    });
    expect(
      (
        await recordPayment({
          actor: actor(owner),
          invoiceId: invoice.id,
          amount: "0.01",
          paidOn: "2026-10-02",
          method: "cash",
          note: "",
        })
      ).error,
    ).toBe(invoiceCopy.paymentClosed);
  });
});
