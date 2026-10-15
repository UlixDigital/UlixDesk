import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  parsePaymentInput,
  paymentMethodLabel,
  statusForPayments,
  type PaymentMethod,
} from "@/lib/invoice-balance";
import { invoiceCopy } from "@/lib/invoice-copy";
import { dateColumn } from "@/lib/invoice-form";
import { canManageWorkspace } from "@/lib/users-validation";

type Actor = { id: string; role: string };

type PaymentRow = {
  id: string;
  amountMinor: number;
  paidOn: Date;
  method: string | null;
  note: string | null;
};

function denied() {
  return { ok: false as const, error: invoiceCopy.denied };
}

function fail(error: string) {
  return { ok: false as const, error };
}

function sumPayments(rows: Array<{ amountMinor: number }>) {
  return rows.reduce((sum, row) => sum + row.amountMinor, 0);
}

function paidOnKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function auditReason(input: {
  action: "record" | "correct" | "delete";
  currency: string;
  amountMinor: number;
  previousMinor?: number;
  paidOn: string;
  method: string | null;
  note: string | null;
}) {
  const amount = formatMoney(input.amountMinor, input.currency);
  const method = paymentMethodLabel(input.method);
  let text: string;
  if (input.action === "record") {
    text = `Recorded ${amount} on ${input.paidOn} (${method}).`;
  } else if (input.action === "correct") {
    const previous = formatMoney(input.previousMinor ?? 0, input.currency);
    text = `Corrected a payment from ${previous} to ${amount}, paid on ${input.paidOn} (${method}).`;
  } else {
    text = `Deleted a payment of ${amount} paid on ${input.paidOn} (${method}).`;
  }
  if (input.note) text = `${text} Note: ${input.note}`;
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

type Change =
  | { kind: "record"; amountMinor: number; paidOn: string; method: PaymentMethod; note: string | null }
  | {
      kind: "correct";
      paymentId: string;
      amountMinor: number;
      paidOn: string;
      method: PaymentMethod;
      note: string | null;
    }
  | { kind: "delete"; paymentId: string };

async function applyPaymentChange(input: { actor: Actor; invoiceId: string; change: Change }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE
    `;
    if (locked.length === 0) return fail(invoiceCopy.notFound);
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { payments: true },
    });
    if (!invoice) return fail(invoiceCopy.notFound);

    const payable = invoice.status === "open" || invoice.status === "partially_paid";
    const adjustable = payable || invoice.status === "paid";
    const payments = invoice.payments as PaymentRow[];

    if (input.change.kind === "record") {
      if (invoice.status === "paid") return fail(invoiceCopy.paymentClosed);
      if (!payable) return fail(invoiceCopy.paymentStatus);
      const due = invoice.totalMinor - sumPayments(payments);
      if (input.change.amountMinor > due) return fail(invoiceCopy.paymentOverpay);
    } else if (!adjustable) {
      return fail(invoiceCopy.paymentAdjustStatus);
    }

    const target =
      input.change.kind === "record"
        ? null
        : (payments.find((payment) => payment.id === input.change.paymentId) ?? null);
    if (input.change.kind !== "record" && !target) return fail(invoiceCopy.paymentMissing);

    const others =
      input.change.kind === "record" ? sumPayments(payments) : sumPayments(payments.filter((payment) => payment.id !== target?.id));
    const nextPaid = input.change.kind === "delete" ? others : others + input.change.amountMinor;
    if (nextPaid > invoice.totalMinor) return fail(invoiceCopy.paymentOverpay);

    let reasonPaidOn = "";
    let reasonMethod: string | null = null;
    let reasonNote: string | null = null;
    let reasonAmount = 0;
    let previousMinor: number | undefined;

    if (input.change.kind === "record") {
      await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amountMinor: input.change.amountMinor,
          paidOn: dateColumn(input.change.paidOn),
          method: input.change.method,
          note: input.change.note,
          recordedById: input.actor.id,
        },
      });
      reasonPaidOn = input.change.paidOn;
      reasonMethod = input.change.method;
      reasonNote = input.change.note;
      reasonAmount = input.change.amountMinor;
    } else if (input.change.kind === "correct" && target) {
      previousMinor = target.amountMinor;
      await tx.invoicePayment.update({
        where: { id: target.id },
        data: {
          amountMinor: input.change.amountMinor,
          paidOn: dateColumn(input.change.paidOn),
          method: input.change.method,
          note: input.change.note,
        },
      });
      reasonPaidOn = input.change.paidOn;
      reasonMethod = input.change.method;
      reasonNote = input.change.note;
      reasonAmount = input.change.amountMinor;
    } else if (target) {
      await tx.invoicePayment.delete({ where: { id: target.id } });
      reasonPaidOn = paidOnKey(target.paidOn);
      reasonMethod = target.method;
      reasonNote = target.note;
      reasonAmount = target.amountMinor;
    }

    const toStatus = statusForPayments(invoice.totalMinor, nextPaid);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidMinor: nextPaid, status: toStatus },
    });
    await tx.invoiceStatusEvent.create({
      data: {
        invoiceId: invoice.id,
        actorId: input.actor.id,
        fromStatus: invoice.status,
        toStatus,
        reason: auditReason({
          action: input.change.kind,
          currency: invoice.currency,
          amountMinor: reasonAmount,
          previousMinor,
          paidOn: reasonPaidOn,
          method: reasonMethod,
          note: reasonNote,
        }),
      },
    });
    return {
      ok: true as const,
      status: toStatus,
      paidMinor: nextPaid,
      dueMinor: invoice.totalMinor - nextPaid,
      totalMinor: invoice.totalMinor,
    };
  });
}

export async function recordPayment(input: {
  actor: Actor;
  invoiceId: string;
  amount: string;
  paidOn: string;
  method: string;
  note: string;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { currency: true },
  });
  if (!invoice) return fail(invoiceCopy.notFound);
  const parsed = parsePaymentInput({
    amount: input.amount,
    currency: invoice.currency,
    paidOn: input.paidOn,
    method: input.method,
    note: input.note,
  });
  if (!parsed.ok) return parsed;
  return applyPaymentChange({
    actor: input.actor,
    invoiceId: input.invoiceId,
    change: {
      kind: "record",
      amountMinor: parsed.amountMinor,
      paidOn: parsed.paidOn,
      method: parsed.method,
      note: parsed.note,
    },
  });
}

export async function correctPayment(input: {
  actor: Actor;
  invoiceId: string;
  paymentId: string;
  amount: string;
  paidOn: string;
  method: string;
  note: string;
}) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { currency: true },
  });
  if (!invoice) return fail(invoiceCopy.notFound);
  const parsed = parsePaymentInput({
    amount: input.amount,
    currency: invoice.currency,
    paidOn: input.paidOn,
    method: input.method,
    note: input.note,
  });
  if (!parsed.ok) return parsed;
  return applyPaymentChange({
    actor: input.actor,
    invoiceId: input.invoiceId,
    change: {
      kind: "correct",
      paymentId: input.paymentId,
      amountMinor: parsed.amountMinor,
      paidOn: parsed.paidOn,
      method: parsed.method,
      note: parsed.note,
    },
  });
}

export async function deletePayment(input: { actor: Actor; invoiceId: string; paymentId: string }) {
  return applyPaymentChange({
    actor: input.actor,
    invoiceId: input.invoiceId,
    change: { kind: "delete", paymentId: input.paymentId },
  });
}

export type { PaymentMethod };
