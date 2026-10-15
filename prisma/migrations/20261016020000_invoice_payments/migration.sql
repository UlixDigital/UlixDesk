-- Slice 15: constraints for recorded payments.
-- Amounts are positive minor units. paidMinor cannot pass the invoice total,
-- so an overpayment is rejected by the database as well as by the app.
-- This file does not contain bank account numbers.

ALTER TABLE "InvoicePayment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_amount_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_method_known" CHECK (
    "method" IS NULL
    OR "method" IN ('bank_transfer', 'card', 'cash', 'check', 'other')
  );

ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_note_length" CHECK (
    "note" IS NULL OR char_length("note") <= 500
  );

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_paid_within_total" CHECK (
    "paidMinor" >= 0 AND "paidMinor" <= "totalMinor"
  );
