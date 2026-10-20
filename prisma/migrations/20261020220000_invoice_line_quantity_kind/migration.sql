-- Line quantity kind.
-- hours keeps quantityMs as a duration in milliseconds.
-- item stores a plain count in quantityMs, scaled by 100000 (1 is 100000).
-- Existing rows, including custom lines, stay hours. Bank details are not stored here.

ALTER TABLE "InvoiceLine" ADD COLUMN "quantityKind" TEXT NOT NULL DEFAULT 'hours';

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_quantityKind_check" CHECK ("quantityKind" IN ('hours', 'item'));
