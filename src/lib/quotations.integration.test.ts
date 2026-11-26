import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as quotationPdf } from "@/app/quotations/[id]/pdf/route";
import { GET as publicPdf } from "@/app/q/[token]/pdf/route";
import { GET as exportCsv } from "@/app/quotations/export/route";
import { prisma } from "@/lib/db";
import { allocateInvoiceNumber } from "@/lib/invoices";
import { setInvoiceMailTransportForTests, type InvoiceMailMessage } from "@/lib/invoice-mail";
import { quotationCopy } from "@/lib/quotation-copy";
import { readQuotationLink, revokeQuotationLink, rotateQuotationLink } from "@/lib/quotation-link";
import { findPublicQuotation } from "@/lib/quotation-public";
import { quotationDisplayStatus } from "@/lib/quotation-status";
import { sendQuotation } from "@/lib/quotation-send";
import {
  allocateQuotationNumber,
  convertQuotationToInvoice,
  createQuotation,
  decideQuotation,
  duplicateQuotation,
  getQuotation,
  listQuotations,
  markQuotationSent,
  quotationDateKey,
  saveQuotationDraft,
} from "@/lib/quotations";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser, signInAs } from "@/lib/test-actor";
import { readFileSync } from "node:fs";
import path from "node:path";
import { addCalendarDays, addCalendarMonths, todayInTimeZone } from "@/lib/time-zone";
import { hashViewToken } from "@/lib/invoice-view-token";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function clientFor() {
  return prisma.client.create({
    data: {
      name: "WSI Web Enhancers",
      currency: "USD",
      address: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
      billingAddress: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
      emails: { create: [{ email: "billing@wsi.test", position: 0 }] },
    },
  });
}

const hoursLine = {
  title: "Weekly quotation",
  detail: "Homepage refresh\nand hosting",
  quantityKind: "hours" as const,
  quantitySeconds: 7200,
  quantityMs: BigInt(7_200_000),
  unitPriceMinor: 2500,
  amountMinor: 5000,
  rangeStart: "2026-10-05",
  rangeEnd: "2026-10-11",
};

async function draftWithLine(actor: { id: string; role: string }, clientId: string, validUntil?: string) {
  const created = await createQuotation({ actor, clientId });
  if (!created.ok) throw new Error(created.error);
  const today = todayInTimeZone("Asia/Colombo");
  const saved = await saveQuotationDraft({
    actor,
    id: created.id,
    draft: {
      issueDate: validUntil && validUntil < today ? validUntil : today,
      validUntil: validUntil ?? addCalendarMonths(today, 3),
      notes: "Please review",
      terms: "Valid until the date shown",
      taxEnabled: true,
      taxLabel: "Tax",
      taxRateBps: 1000,
      lines: [hoursLine],
    },
  });
  if (!saved.ok) throw new Error(saved.error);
  return created;
}

describe("quotation numbering", () => {
  it("allocates ULXQ2100 from its own counter and leaves invoice numbers alone", async () => {
    const owner = await createTestUser("owner", "quote-owner@ulix.test");
    const client = await clientFor();
    const invoiceNumber = await prisma.$transaction((tx) => allocateInvoiceNumber(tx));
    const first = await prisma.$transaction((tx) => allocateQuotationNumber(tx));
    const second = await prisma.$transaction((tx) => allocateQuotationNumber(tx));
    expect(invoiceNumber).toBe("LE1176");
    expect(first).toBe("ULXQ2100");
    expect(second).toBe("ULXQ2101");
    expect((await prisma.workspaceSettings.findUnique({ where: { id: "workspace" } }))?.nextInvoiceNumber).toBe(1177);
    expect((await prisma.workspaceSettings.findUnique({ where: { id: "workspace" } }))?.nextQuotationNumber).toBe(2102);
    const created = await createQuotation({ actor: { id: owner.id, role: owner.role }, clientId: client.id });
    expect(created.ok && created.number).toBe("ULXQ2102");
  });
});

describe("quotation expiry, totals, duplicate, and convert", () => {
  it("derives expired, stores tax, duplicates, and converts an accepted quotation", async () => {
    const owner = await createTestUser("owner", "quote-flow@ulix.test");
    const actor = { id: owner.id, role: owner.role };
    const client = await clientFor();
    const today = todayInTimeZone("Asia/Colombo");
    const yesterday = addCalendarDays(today, -1);
    const created = await draftWithLine(actor, client.id, yesterday);
    const stored = await getQuotation(owner.role, created.id);
    expect(stored?.subtotalMinor).toBe(5000);
    expect(stored?.taxMinor).toBe(500);
    expect(stored?.totalMinor).toBe(5500);
    expect(stored?.status).toBe("draft");
    expect(
      quotationDisplayStatus({
        status: stored?.status ?? "",
        validUntil: quotationDateKey(stored!.validUntil),
        today,
      }),
    ).toBe("expired");
    const expired = await listQuotations(owner.role, { status: "expired" }, today);
    expect(expired.map((row) => row.number)).toEqual([created.number]);
    expect(await listQuotations(owner.role, { status: "draft" }, today)).toEqual([]);

    const copy = await duplicateQuotation({ actor, id: created.id });
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    const duplicated = await getQuotation(owner.role, copy.id);
    expect(duplicated?.status).toBe("draft");
    expect(duplicated?.number).toBe("ULXQ2101");
    expect(duplicated?.lines[0]?.detail).toBe("Homepage refresh\nand hosting");
    expect(duplicated?.invoiceId).toBeNull();
    expect(duplicated?.lines).toHaveLength(1);
    expect(duplicated?.lines[0]?.title).toBe("Weekly quotation");
    expect(duplicated?.totalMinor).toBe(5500);
    expect(quotationDateKey(duplicated!.validUntil)).toBe(addCalendarMonths(today, 3));
    expect(
      quotationDisplayStatus({
        status: "draft",
        validUntil: quotationDateKey(duplicated!.validUntil),
        today,
      }),
    ).toBe("draft");

    const accepted = await decideQuotation({ actor, id: created.id, decision: "accepted" });
    expect(accepted.ok).toBe(true);
    const decided = await getQuotation(owner.role, created.id);
    expect(decided?.status).toBe("accepted");
    expect(
      quotationDisplayStatus({
        status: "accepted",
        validUntil: quotationDateKey(decided!.validUntil),
        today,
      }),
    ).toBe("accepted");
    expect(await listQuotations(owner.role, { status: "expired" }, today)).toEqual([]);

    const converted = await convertQuotationToInvoice({ actor, id: created.id });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.number.startsWith("Q-")).toBe(false);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: converted.invoiceId },
      include: { lines: true },
    });
    expect(invoice.status).toBe("draft");
    expect(invoice.clientId).toBe(client.id);
    expect(invoice.currency).toBe("USD");
    expect(invoice.taxEnabled).toBe(true);
    expect(invoice.taxRateBps).toBe(1000);
    expect(invoice.taxMinor).toBe(500);
    expect(invoice.totalMinor).toBe(5500);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]).toMatchObject({
      kind: "custom",
      title: "Weekly quotation\nHomepage refresh\nand hosting",
      detail: "",
      quantityKind: "hours",
      amountMinor: 5000,
    });
    expect((await getQuotation(owner.role, created.id))?.invoiceId).toBe(invoice.id);
    const again = await convertQuotationToInvoice({ actor, id: created.id });
    expect(again).toEqual({ ok: false, error: quotationCopy.alreadyConverted });
  });
});

describe("quotation access", () => {
  it("blocks members from the list, the record, and the PDF", async () => {
    const owner = await createTestUser("owner", "quote-access@ulix.test");
    const client = await clientFor();
    const created = await createQuotation({ actor: { id: owner.id, role: owner.role }, clientId: client.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const member = await signInAs("member", "quote-member@ulix.test");
    const today = todayInTimeZone("Asia/Colombo");
    expect(await listQuotations(member.user.role, {}, today)).toEqual([]);
    expect(await getQuotation(member.user.role, created.id)).toBeNull();
    expect(await createQuotation({ actor: { id: member.user.id, role: member.user.role }, clientId: client.id })).toEqual({
      ok: false,
      error: quotationCopy.denied,
    });
    const denied = await quotationPdf(new Request("http://desk.example.com/quotations/x/pdf"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(denied.status).toBe(403);
    const exportDenied = await exportCsv(new Request("http://desk.example.com/quotations/export"));
    expect(exportDenied.status).toBe(403);

    await signInAs("owner", "quote-pdf-owner@ulix.test");
    const csv = await exportCsv(new Request("http://desk.example.com/quotations/export"));
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain(created.number);
  });
});

describe("quotation share link and email", () => {
  it("keeps the token hashed, hides drafts, and sends through the test mail transport", async () => {
    const owner = await createTestUser("owner", "quote-send@ulix.test");
    const actor = { id: owner.id, role: owner.role };
    const client = await clientFor();
    const created = await draftWithLine(actor, client.id);
    const rotated = await rotateQuotationLink({ actor, id: created.id });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    const row = await prisma.quotation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.viewTokenHash).toBe(hashViewToken(rotated.token));
    expect(row.viewTokenHash).not.toContain(rotated.token);
    expect(row.viewTokenCipher ?? "").not.toContain(rotated.token);
    expect(await findPublicQuotation(rotated.token)).toBeNull();

    const opened = await readQuotationLink(owner.role, created.id);
    expect(opened?.active && opened.path).toBe(`/q/${rotated.token}`);

    const captured: InvoiceMailMessage[] = [];
    setInvoiceMailTransportForTests({
      async send(message) {
        captured.push(message);
      },
    });
    const blocked = await sendQuotation({
      actor,
      id: created.id,
      to: "billing@wsi.test",
      cc: "",
      subject: `Quotation ${created.number}`,
      body: "Please review.",
      confirmSend: false,
    });
    expect(blocked.ok).toBe(false);
    expect((await getQuotation(owner.role, created.id))?.status).toBe("draft");

    const sent = await sendQuotation({
      actor,
      id: created.id,
      to: "billing@wsi.test",
      cc: "copy@wsi.test",
      subject: `Quotation ${created.number}`,
      body: "Please review.",
      confirmSend: true,
    });
    expect(sent.ok).toBe(true);
    expect((await getQuotation(owner.role, created.id))?.status).toBe("sent");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toEqual(["billing@wsi.test"]);
    expect(captured[0]?.cc).toEqual(["copy@wsi.test"]);
    expect(captured[0]?.attachments[0]?.filename).toBe(`Quotation-${created.number}.pdf`);
    expect(captured[0]?.attachments[0]?.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(captured[0]?.text).toContain("/q/");
    const email = await prisma.quotationEmail.findFirstOrThrow({ where: { quotationId: created.id } });
    expect(email.success).toBe(true);

    const visible = await findPublicQuotation(rotated.token);
    expect(visible?.number).toBe(created.number);
    expect(visible?.totalMinor).toBe(5500);
    const pdf = await publicPdf(new Request("http://127.0.0.1/q/token/pdf"), {
      params: Promise.resolve({ token: rotated.token }),
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");

    await revokeQuotationLink({ actor, id: created.id });
    expect(await findPublicQuotation(rotated.token)).toBeNull();
  });

  it("refuses email unless the test transport is installed", async () => {
    const owner = await createTestUser("owner", "quote-nomail@ulix.test");
    const client = await clientFor();
    const created = await draftWithLine({ id: owner.id, role: owner.role }, client.id);
    await markQuotationSent({ actor: { id: owner.id, role: owner.role }, id: created.id });
    const refused = await sendQuotation({
      actor: { id: owner.id, role: owner.role },
      id: created.id,
      to: "billing@wsi.test",
      cc: "",
      subject: "Quotation",
      body: "Please review.",
      confirmSend: true,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(quotationCopy.mailUnconfigured);
    expect(await prisma.quotationEmail.count()).toBe(0);
  });
});

function renumberSql() {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261126120000_quotation_ulxq_numbers/migration.sql"),
    "utf8",
  );
  const match = sql.match(/DO \$\$[\s\S]*?END \$\$;/);
  if (!match) throw new Error("The quotation renumber migration has no DO block.");
  return match[0];
}

describe("quotation number migration", () => {
  it("rewrites Q- numbers in creation order and is safe to run again", async () => {
    const owner = await createTestUser("owner", "quote-renumber@ulix.test");
    const client = await clientFor();
    await prisma.workspaceSettings.upsert({
      where: { id: "workspace" },
      update: { quotationPrefix: "Q", nextQuotationNumber: 12 },
      create: { id: "workspace", quotationPrefix: "Q", nextQuotationNumber: 12 },
    });
    const quote = {
      clientId: client.id,
      status: "sent",
      currency: "USD",
      issueDate: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-04-01T00:00:00.000Z"),
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdById: owner.id,
    };
    const first = await prisma.quotation.create({
      data: { ...quote, number: "Q-0009", createdAt: new Date("2026-01-02T00:00:00.000Z") },
    });
    const second = await prisma.quotation.create({
      data: { ...quote, number: "Q-0002", createdAt: new Date("2026-03-04T00:00:00.000Z") },
    });
    await prisma.quotationNumber.createMany({ data: [{ number: "Q-0009" }, { number: "Q-0002" }] });
    await prisma.invoiceNumber.create({ data: { number: "LE1176" } });

    await prisma.$executeRawUnsafe(renumberSql());
    expect((await prisma.quotation.findUnique({ where: { id: first.id } }))?.number).toBe("ULXQ2100");
    expect((await prisma.quotation.findUnique({ where: { id: second.id } }))?.number).toBe("ULXQ2101");
    expect(await prisma.quotationNumber.findUnique({ where: { number: "Q-0009" } })).toBeNull();
    expect(await prisma.quotationNumber.findUnique({ where: { number: "ULXQ2100" } })).toBeTruthy();
    expect(await prisma.invoiceNumber.findUnique({ where: { number: "LE1176" } })).toBeTruthy();
    const settings = await prisma.workspaceSettings.findUniqueOrThrow({ where: { id: "workspace" } });
    expect(settings.quotationPrefix).toBe("ULXQ");
    expect(settings.nextQuotationNumber).toBe(2102);

    await prisma.$executeRawUnsafe(renumberSql());
    expect((await prisma.quotation.findUnique({ where: { id: first.id } }))?.number).toBe("ULXQ2100");
    expect((await prisma.quotation.findUnique({ where: { id: second.id } }))?.number).toBe("ULXQ2101");
    expect((await prisma.workspaceSettings.findUnique({ where: { id: "workspace" } }))?.nextQuotationNumber).toBe(2102);

    await prisma.quotation.update({ where: { id: first.id }, data: { number: "ULXQ2150" } });
    const later = await prisma.quotation.create({
      data: { ...quote, number: "Q-0044", createdAt: new Date("2026-06-01T00:00:00.000Z") },
    });
    await prisma.$executeRawUnsafe(renumberSql());
    expect((await prisma.quotation.findUnique({ where: { id: later.id } }))?.number).toBe("ULXQ2151");
    expect((await prisma.quotation.findUnique({ where: { id: first.id } }))?.number).toBe("ULXQ2150");
  });
});
