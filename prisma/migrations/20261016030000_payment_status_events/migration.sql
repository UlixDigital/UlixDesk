-- A recorded, corrected, or deleted payment writes InvoiceStatusEvent even when
-- the invoice status does not change (a partial payment stays open).
-- The status values stay limited to the invoice statuses.

ALTER TABLE "InvoiceStatusEvent" DROP CONSTRAINT "InvoiceStatusEvent_status_check";

ALTER TABLE "InvoiceStatusEvent"
  ADD CONSTRAINT "InvoiceStatusEvent_status_check" CHECK (
    "fromStatus" IN ('draft', 'open', 'paid', 'partially_paid', 'void')
    AND "toStatus" IN ('draft', 'open', 'paid', 'partially_paid', 'void')
  );
