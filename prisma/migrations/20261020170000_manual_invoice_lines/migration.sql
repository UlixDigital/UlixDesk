-- Manual invoice lines.
-- quantityMs is the duration in whole milliseconds. It is the source of truth
-- for a line amount. quantitySeconds stays the nearest whole second.
-- A date range is optional. Both ends are set, or neither is.
-- Bank account numbers are not stored in this migration.

ALTER TABLE "InvoiceLine" ADD COLUMN "quantityMs" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceLine" ADD COLUMN "rangeStart" DATE;
ALTER TABLE "InvoiceLine" ADD COLUMN "rangeEnd" DATE;

UPDATE "InvoiceLine"
SET "quantityMs" = "quantitySeconds"::bigint * 1000;

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_quantityMs_check" CHECK ("quantityMs" >= 0),
  ADD CONSTRAINT "InvoiceLine_range_check" CHECK (
    ("rangeStart" IS NULL AND "rangeEnd" IS NULL)
    OR ("rangeStart" IS NOT NULL AND "rangeEnd" IS NOT NULL AND "rangeEnd" >= "rangeStart")
  );
