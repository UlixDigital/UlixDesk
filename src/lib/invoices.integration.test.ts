import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as stopRoute } from "@/app/api/timer/stop/route";
import { GET as invoicePdf } from "@/app/invoices/[id]/pdf/route";
import { createAccessToken } from "@/lib/access-tokens";
import { apiCodes } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { InvoicedTimeError } from "@/lib/invoice-lock";
import { dateColumn } from "@/lib/invoice-form";
import { allocateInvoiceNumber, createInvoice, deleteDraft, getInvoice, listInvoices, saveDraft } from "@/lib/invoices";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser, signInAs } from "@/lib/test-actor";
import { setTestSessionToken } from "@/lib/test-hooks";
import { deleteTimeEntry, startTimer, stopTimer, updateManualEntry } from "@/lib/time-entries";
import { zonedDayStart } from "@/lib/time-zone";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function workspace() {
  const owner = await createTestUser("owner", "invoice-owner@ulix.test");
  const member = await createTestUser("member", "invoice-member@ulix.test");
  const client = await prisma.client.create({
    data: {
      name: "WSI Web Enhancers",
      currency: "USD",
      address: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
      billingAddress: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
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
  return { owner, member, client, project };
}

async function addTime(input: {
  projectId: string;
  userId: string;
  day: string;
  seconds: number;
  billable?: boolean;
}) {
  const startedAt = new Date(zonedDayStart(input.day, "Asia/Colombo").getTime() + 60 * 60 * 1000);
  return prisma.timeEntry.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      startedAt,
      endedAt: new Date(startedAt.getTime() + input.seconds * 1000),
      billable: input.billable ?? true,
      source: "manual",
    },
  });
}

describe("invoice numbers", () => {
  it("allocates the next number and does not reuse it after a draft is deleted", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const first = await createInvoice({
      actor,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(first.ok && first.number).toBe("LE1176");
    if (!first.ok) return;
    expect((await deleteDraft({ actor, id: first.id })).ok).toBe(true);
    expect(await prisma.invoiceNumber.findUnique({ where: { number: "LE1176" } })).not.toBeNull();

    await prisma.workspaceSettings.update({
      where: { id: "workspace" },
      data: { nextInvoiceNumber: 1176 },
    });
    const reused = await prisma.$transaction((tx) => allocateInvoiceNumber(tx));
    expect(reused).toBe("LE1177");

    const second = await createInvoice({
      actor,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(second.ok && second.number).toBe("LE1178");
  });

  it("does not burn a number when the transaction rolls back, and parallel calls stay unique", async () => {
    await prisma.workspaceSettings.create({ data: { id: "workspace" } });
    await expect(
      prisma.$transaction(async (tx) => {
        await allocateInvoiceNumber(tx);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await prisma.workspaceSettings.findUnique({ where: { id: "workspace" } }))?.nextInvoiceNumber).toBe(1176);
    expect(await prisma.invoiceNumber.count()).toBe(0);

    const numbers = await Promise.all([
      prisma.$transaction((tx) => allocateInvoiceNumber(tx)),
      prisma.$transaction((tx) => allocateInvoiceNumber(tx)),
    ]);
    expect(new Set(numbers)).toEqual(new Set(["LE1176", "LE1177"]));
  });
});

describe("invoice drafts", () => {
  it("bills rated time once, splits mixed rates, and warns about unrated time", async () => {
    const { owner, member, client, project } = await workspace();
    const otherUser = await createTestUser("member", "unrated-member@ulix.test");
    const other = await prisma.project.create({
      data: { name: "Unrated", clientId: client.id, billable: true },
    });
    const yen = await prisma.client.create({ data: { name: "Yen Co", currency: "JPY" } });
    const yenProject = await prisma.project.create({
      data: { name: "Yen site", clientId: yen.id, billable: true },
    });
    await prisma.billRate.deleteMany({ where: { clientId: client.id, scope: "client" } });
    await prisma.billRate.create({
      data: {
        scope: "project",
        projectId: project.id,
        amountMinor: 2500,
        currency: "USD",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.id,
      },
    });
    await prisma.billRate.create({
      data: {
        scope: "project",
        projectId: project.id,
        amountMinor: 3000,
        currency: "USD",
        effectiveFrom: new Date("2026-10-07T00:00:00.000Z"),
        createdById: owner.id,
      },
    });
    await prisma.billRate.create({
      data: {
        scope: "member",
        clientId: client.id,
        userId: member.id,
        amountMinor: 1500,
        currency: "JPY",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.id,
      },
    });
    await prisma.billRate.create({
      data: {
        scope: "client",
        clientId: yen.id,
        amountMinor: 1500,
        currency: "JPY",
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        createdById: owner.id,
      },
    });
    await addTime({ projectId: project.id, userId: member.id, day: "2026-10-05", seconds: 3600 });
    await addTime({ projectId: project.id, userId: member.id, day: "2026-10-07", seconds: 3600 });
    const open = await addTime({ projectId: other.id, userId: otherUser.id, day: "2026-10-06", seconds: 600 });
    const mismatched = await addTime({ projectId: other.id, userId: member.id, day: "2026-10-08", seconds: 600 });
    await addTime({ projectId: yenProject.id, userId: member.id, day: "2026-10-06", seconds: 1800 });

    const created = await createInvoice({
      actor: { id: owner.id, role: owner.role },
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invoice = await getInvoice(owner.role, created.id);
    expect(invoice?.lines.map((line) => [line.unitPriceMinor, line.quantitySeconds, line.amountMinor])).toEqual([
      [2500, 3600, 2500],
      [3000, 3600, 3000],
    ]);
    expect(created.unrated.map((item) => [item.timeEntryId, item.reason])).toEqual([
      [open.id, "no-rate"],
      [mismatched.id, "currency"],
    ]);

    const again = await createInvoice({
      actor: { id: owner.id, role: owner.role },
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const second = await getInvoice(owner.role, again.id);
    expect(second?.lines).toHaveLength(0);

    const yenInvoice = await createInvoice({
      actor: { id: owner.id, role: owner.role },
      clientId: yen.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(yenInvoice.ok).toBe(true);
    if (!yenInvoice.ok) return;
    const yenDetail = await getInvoice(owner.role, yenInvoice.id);
    expect(yenDetail?.currency).toBe("JPY");
    expect(yenDetail?.lines[0]?.amountMinor).toBe(750);
    expect(yenDetail?.lines[0]?.quantitySeconds).toBe(1800);
  });

  it("saves a custom line, discount, and tax, then issues the draft", async () => {
    const { owner, client } = await workspace();
    const actor = { id: owner.id, role: owner.role };
    const created = await createInvoice({
      actor,
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const saved = await saveDraft({
      actor,
      id: created.id,
      issue: false,
      draft: {
        issueDate: "2026-10-12",
        dueDate: "2026-10-19",
        poNumber: "PO-4421",
        notes: "Thanks",
        bankDetails: "Bank",
        discountKind: "percent",
        discountAmountMinor: 0,
        discountBps: 1000,
        taxEnabled: true,
        taxLabel: "Tax",
        taxRateBps: 1000,
        lines: [
          {
            id: null,
            title: "Custom line",
            detail: "",
            quantitySeconds: 3600,
            unitPriceMinor: 10_000,
            amountMinor: 10_000,
          },
        ],
      },
    });
    expect(saved.ok).toBe(true);
    const draft = await getInvoice(owner.role, created.id);
    expect(draft?.poNumber).toBe("PO-4421");
    expect(draft?.subtotalMinor).toBe(10_000);
    expect(draft?.discountMinor).toBe(1_000);
    expect(draft?.taxMinor).toBe(900);
    expect(draft?.totalMinor).toBe(9_900);
    expect((await saveDraft({ actor, id: created.id, issue: true, draft: draftWrite(draft!) })).ok).toBe(true);
    expect((await getInvoice(owner.role, created.id))?.status).toBe("open");
    expect((await saveDraft({ actor, id: created.id, issue: false, draft: draftWrite(draft!) })).ok).toBe(false);
  });
});

describe("issued time locking", () => {
  it("blocks edit, delete, move, the API, and a raw write after issue", async () => {
    const { owner, member, client, project } = await workspace();
    const entry = await addTime({ projectId: project.id, userId: member.id, day: "2026-10-06", seconds: 3600 });
    const created = await createInvoice({
      actor: { id: owner.id, role: owner.role },
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const edited = await updateManualEntry(
      entry.id,
      {
        projectId: project.id,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt!,
        billable: true,
        note: "Still a draft",
      },
      new Date("2026-10-15T12:00:00.000Z"),
      member.id,
    );
    expect(edited?.entry.note).toBe("Still a draft");

    const invoice = await getInvoice(owner.role, created.id);
    expect((await saveDraft({
      actor: { id: owner.id, role: owner.role },
      id: created.id,
      issue: true,
      draft: draftWrite(invoice!),
    })).ok).toBe(true);

    await expect(
      updateManualEntry(
        entry.id,
        {
          projectId: project.id,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt!,
          billable: false,
          note: "Moved",
        },
        new Date("2026-10-15T12:00:00.000Z"),
        member.id,
      ),
    ).rejects.toBeInstanceOf(InvoicedTimeError);
    const removed = await deleteTimeEntry(entry.id, member.id, {
      actorId: member.id,
      source: "web",
      changedAt: new Date("2026-10-15T12:00:00.000Z"),
    });
    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.reason).toBe("invoiced");
    await expect(
      prisma.timeEntry.update({ where: { id: entry.id }, data: { note: "raw" } }),
    ).rejects.toThrow(/INVOICED_TIME/);
    await expect(prisma.timeEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/INVOICED_TIME/);

    const running = await startTimer({
      userId: member.id,
      projectId: project.id,
      note: "",
      now: new Date("2026-10-15T08:00:00.000Z"),
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const line = invoice?.lines[0];
    expect(line).toBeTruthy();
    await prisma.invoiceTime.create({
      data: { timeEntryId: running.timer.id, invoiceId: created.id, invoiceLineId: line!.id },
    });
    const stopped = await stopTimer(new Date("2026-10-15T09:00:00.000Z"), member.id);
    expect(stopped.ok).toBe(false);
    if (stopped.ok) return;
    expect(stopped.code).toBe("invoiced");

    const token = await createAccessToken("Laptop", member.id);
    const api = await stopRoute(
      new Request("http://localhost/api/timer/stop", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token.token}` },
        body: "{}",
      }),
    );
    expect(api.status).toBe(409);
    expect(await api.json()).toMatchObject({ code: apiCodes.INVOICED_TIME });
  });

  it("lets a void invoice release the time", async () => {
    const { owner, member, client, project } = await workspace();
    const entry = await addTime({ projectId: project.id, userId: member.id, day: "2026-10-06", seconds: 60 });
    const created = await createInvoice({
      actor: { id: owner.id, role: owner.role },
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await prisma.invoice.update({ where: { id: created.id }, data: { status: "void" } });
    const edited = await updateManualEntry(
      entry.id,
      {
        projectId: project.id,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt!,
        billable: true,
        note: "Voided",
      },
      new Date("2026-10-15T12:00:00.000Z"),
      member.id,
    );
    expect(edited?.entry.note).toBe("Voided");
  });
});

describe("invoice access", () => {
  it("hides invoices and the PDF from members", async () => {
    const { owner, client } = await workspace();
    const created = await createInvoice({
      actor: { id: owner.id, role: owner.role },
      clientId: client.id,
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      grouping: "period",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const member = await signInAs("member", "denied-member@ulix.test");
    expect(await listInvoices(member.user.role, {})).toEqual([]);
    expect(await getInvoice(member.user.role, created.id)).toBeNull();
    expect(
      (
        await createInvoice({
          actor: { id: member.user.id, role: member.user.role },
          clientId: client.id,
          periodStart: "2026-10-05",
          periodEnd: "2026-10-11",
          grouping: "period",
        })
      ).ok,
    ).toBe(false);
    const denied = await invoicePdf(new Request("http://desk.example.com/invoices/x/pdf"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(denied.status).toBe(403);

    await signInAs("owner", "pdf-owner@ulix.test");
    const ok = await invoicePdf(new Request("http://desk.example.com/invoices/x/pdf"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("application/pdf");
    const bytes = Buffer.from(await ok.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    setTestSessionToken(null);
    const anonymous = await invoicePdf(new Request("http://desk.example.com/invoices/x/pdf"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(anonymous.status).toBe(401);

    const listed = await listInvoices(owner.role, { clientId: client.id, status: "draft" });
    expect(listed.map((row) => row.number)).toEqual([created.number]);
  });
});

function draftWrite(invoice: {
  issueDate: Date;
  dueDate: Date;
  poNumber: string | null;
  notes: string;
  bankDetails: string;
  discountKind: string;
  discountAmountMinor: number;
  discountBps: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  lines: Array<{
    id: string;
    title: string;
    detail: string;
    quantitySeconds: number;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
}) {
  const kind = invoice.discountKind === "amount" || invoice.discountKind === "percent" ? invoice.discountKind : "none";
  return {
    issueDate: dateColumnKey(invoice.issueDate),
    dueDate: dateColumnKey(invoice.dueDate),
    poNumber: invoice.poNumber,
    notes: invoice.notes,
    bankDetails: invoice.bankDetails,
    discountKind: kind,
    discountAmountMinor: invoice.discountAmountMinor,
    discountBps: invoice.discountBps,
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

function dateColumnKey(value: Date) {
  return dateColumn(value.toISOString().slice(0, 10)).toISOString().slice(0, 10);
}
