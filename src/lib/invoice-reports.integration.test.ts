import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { agingBucket, daysPastDue, invoiceBalance } from "@/lib/invoice-balance";
import { dateColumn } from "@/lib/invoice-form";
import { invoiceReportCopy } from "@/lib/invoice-report-copy";
import { clientInvoicesToCsv, loadAgingReport, loadClientInvoiceReport } from "@/lib/invoice-reports";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createSavedReport } from "@/lib/saved-reports";
import { createTestUser } from "@/lib/test-actor";
import { addCalendarDays } from "@/lib/time-zone";

const asOf = "2026-10-15";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function workspace() {
  const owner = await createTestUser("owner", "report-owner@ulix.test");
  const member = await createTestUser("member", "report-member@ulix.test");
  const usd = await prisma.client.create({ data: { name: "Acme", currency: "USD" } });
  const eur = await prisma.client.create({ data: { name: "Euro Client", currency: "EUR" } });
  return { owner, member, usd, eur };
}

async function pay(input: { invoiceId: string; ownerId: string; amountMinor: number; paidOn: string }) {
  await prisma.invoicePayment.create({
    data: {
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      paidOn: dateColumn(input.paidOn),
      method: "bank_transfer",
      recordedById: input.ownerId,
    },
  });
}

async function seed(input: {
  ownerId: string;
  clientId: string;
  number: string;
  status: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  totalMinor: number;
  paidMinor?: number;
}) {
  return prisma.invoice.create({
    data: {
      number: input.number,
      clientId: input.clientId,
      status: input.status,
      currency: input.currency,
      issueDate: dateColumn(input.issueDate),
      dueDate: dateColumn(input.dueDate),
      periodStart: dateColumn(input.issueDate),
      periodEnd: dateColumn(input.issueDate),
      grouping: "period",
      notes: "",
      bankDetails: "Beneficiary Name: Ulix Digital",
      subtotalMinor: input.totalMinor,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: input.totalMinor,
      paidMinor: input.paidMinor ?? 0,
      createdById: input.ownerId,
      issuedAt: input.status === "draft" ? null : new Date("2026-01-15T00:00:00.000Z"),
      lines: {
        create: {
          position: 0,
          kind: "custom",
          title: "Work",
          quantitySeconds: 3600,
          unitPriceMinor: input.totalMinor,
          amountMinor: input.totalMinor,
        },
      },
    },
  });
}

describe("client invoices and aging", () => {
  it("buckets 0, 1, 30, 31, 60, 61, 90, and 91 days and keeps each currency separate", async () => {
    const { owner, member, usd, eur } = await workspace();
    const boundaries = [0, 1, 30, 31, 60, 61, 90, 91];
    for (const days of boundaries) {
      await seed({
        ownerId: owner.id,
        clientId: usd.id,
        number: `LE${3000 + days}`,
        status: "open",
        currency: "USD",
        issueDate: "2026-01-15",
        dueDate: addCalendarDays(asOf, -days),
        totalMinor: (days + 1) * 100,
      });
    }
    await seed({
      ownerId: owner.id,
      clientId: eur.id,
      number: "LE3100",
      status: "open",
      currency: "EUR",
      issueDate: "2026-01-15",
      dueDate: asOf,
      totalMinor: 500,
    });
    await seed({
      ownerId: owner.id,
      clientId: usd.id,
      number: "LE3101",
      status: "draft",
      currency: "USD",
      issueDate: "2026-01-15",
      dueDate: addCalendarDays(asOf, -91),
      totalMinor: 9999,
    });
    await seed({
      ownerId: owner.id,
      clientId: usd.id,
      number: "LE3102",
      status: "void",
      currency: "USD",
      issueDate: "2026-01-15",
      dueDate: addCalendarDays(asOf, -91),
      totalMinor: 8888,
    });
    const settled = await seed({
      ownerId: owner.id,
      clientId: usd.id,
      number: "LE3103",
      status: "paid",
      currency: "USD",
      issueDate: "2026-01-15",
      dueDate: addCalendarDays(asOf, -10),
      totalMinor: 4000,
      paidMinor: 4000,
    });
    await pay({ invoiceId: settled.id, ownerId: owner.id, amountMinor: 4000, paidOn: "2026-10-01" });
    await seed({
      ownerId: owner.id,
      clientId: usd.id,
      number: "LE3104",
      status: "open",
      currency: "USD",
      issueDate: "2026-10-16",
      dueDate: addCalendarDays(asOf, -5),
      totalMinor: 7777,
    });

    const aging = await loadAgingReport({
      actor: owner,
      params: { preset: "custom", from: "2026-01-01", to: asOf },
      today: asOf,
    });
    expect(aging.ok).toBe(true);
    if (!aging.ok) return;
    const usdRow = aging.rows.find((row) => row.currency === "USD");
    const eurRow = aging.rows.find((row) => row.currency === "EUR");
    expect(usdRow?.buckets).toEqual({
      current: (0 + 1) * 100,
      d1: (1 + 1) * 100 + (30 + 1) * 100,
      d31: (31 + 1) * 100 + (60 + 1) * 100,
      d61: (61 + 1) * 100 + (90 + 1) * 100,
      d91: (91 + 1) * 100,
    });
    for (const days of boundaries) {
      expect(agingBucket(daysPastDue(addCalendarDays(asOf, -days), asOf))).toBe(
        days === 0 ? "current" : days <= 30 ? "d1" : days <= 60 ? "d31" : days <= 90 ? "d61" : "d91",
      );
    }
    expect(eurRow?.buckets.current).toBe(500);
    expect(eurRow?.totalMinor).toBe(500);
    expect(aging.totals.map((total) => total.currency)).toEqual(["EUR", "USD"]);
    const usdTotal = aging.totals.find((total) => total.currency === "USD");
    const eurTotal = aging.totals.find((total) => total.currency === "EUR");
    expect(usdTotal?.totalMinor).not.toBe((eurTotal?.totalMinor ?? 0) + (usdTotal?.totalMinor ?? 0));
    expect(usdTotal?.totalMinor).toBe(usdRow?.totalMinor);
    expect(eurTotal?.totalMinor).toBe(500);

    const listed = await loadClientInvoiceReport({
      actor: owner,
      params: { preset: "custom", from: "2026-01-01", to: "2026-12-31", status: "all" },
      today: asOf,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.rows.some((row) => row.number === "LE3101" || row.number === "LE3102")).toBe(false);
    expect(listed.rows.some((row) => row.number === "LE3103")).toBe(true);
    for (const row of listed.rows) {
      expect(invoiceBalance(row.totalMinor, row.paidMinor)).toMatchObject({ dueMinor: row.dueMinor, balanced: true });
    }
    for (const total of listed.totals) {
      expect(total.paidMinor + total.dueMinor).toBe(total.totalMinor);
    }
    expect(listed.totals).toHaveLength(2);
    const overdue = listed.rows.find((row) => row.number === "LE3001");
    expect(overdue?.overdue).toBe(true);
    expect(listed.rows.find((row) => row.number === "LE3000")?.overdue).toBe(false);

    const csv = clientInvoicesToCsv(listed.rows, listed.totals);
    expect(csv).toContain("LE3000");
    expect(csv).not.toContain("LE3101");
    expect(csv).not.toContain("LE3102");

    expect((await loadClientInvoiceReport({ actor: member, params: {}, today: asOf })).ok).toBe(false);
    expect((await loadAgingReport({ actor: member, params: {}, today: asOf })).ok).toBe(false);
    expect(
      (
        await createSavedReport({
          actor: member,
          name: "Money",
          reportType: "client-invoices",
          visibility: "private",
          params: {},
          today: asOf,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createSavedReport({
          actor: owner,
          name: "October invoices",
          reportType: "client-invoices",
          visibility: "shared",
          params: { preset: "custom", from: "2026-01-01", to: "2026-12-31", status: "open" },
          today: asOf,
        })
      ).ok,
    ).toBe(true);
    expect(invoiceReportCopy.denied).not.toMatch(/\d/);
  });

  it("ignores a payment dated after the as-of date when it buckets the balance", async () => {
    const { owner, usd } = await workspace();
    const invoice = await seed({
      ownerId: owner.id,
      clientId: usd.id,
      number: "LE3200",
      status: "paid",
      currency: "USD",
      issueDate: "2026-01-15",
      dueDate: "2026-10-01",
      totalMinor: 10_000,
      paidMinor: 10_000,
    });
    await pay({ invoiceId: invoice.id, ownerId: owner.id, amountMinor: 4000, paidOn: "2026-10-15" });
    await pay({ invoiceId: invoice.id, ownerId: owner.id, amountMinor: 6000, paidOn: "2026-10-16" });

    const onDate = await loadAgingReport({
      actor: owner,
      params: { preset: "custom", from: "2026-01-01", to: "2026-10-15" },
      today: "2026-10-15",
    });
    expect(onDate.ok).toBe(true);
    if (!onDate.ok) return;
    expect(onDate.rows).toEqual([
      {
        clientName: "Acme",
        currency: "USD",
        buckets: { current: 0, d1: 6000, d31: 0, d61: 0, d91: 0 },
        totalMinor: 6000,
      },
    ]);

    const before = await loadAgingReport({
      actor: owner,
      params: { preset: "custom", from: "2026-01-01", to: "2026-10-14" },
      today: "2026-10-14",
    });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.rows[0]?.buckets.d1).toBe(10_000);

    const after = await loadAgingReport({
      actor: owner,
      params: { preset: "custom", from: "2026-01-01", to: "2026-10-16" },
      today: "2026-10-16",
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows).toEqual([]);
  });
});
