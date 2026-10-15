-- Bill a time entry in windows instead of claiming the whole row.
-- A window that crosses a period boundary can be split across invoices.
-- Overlapping windows on the same entry are rejected.
-- time_entry_invoice_lock still locks the whole entry when any window
-- belongs to an issued invoice (open, paid, partially_paid). Drafts and void do not.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "InvoiceTime" ADD COLUMN "id" TEXT;
ALTER TABLE "InvoiceTime" ADD COLUMN "sliceStart" TIMESTAMP(3);
ALTER TABLE "InvoiceTime" ADD COLUMN "sliceEnd" TIMESTAMP(3);

-- Existing links claimed the whole finished entry. Keep that claim so a
-- window that was already reserved cannot be billed again.
UPDATE "InvoiceTime" AS link
SET
  "id" = link."timeEntryId",
  "sliceStart" = entry."startedAt",
  "sliceEnd" = entry."endedAt"
FROM "TimeEntry" AS entry
WHERE entry."id" = link."timeEntryId"
  AND entry."endedAt" IS NOT NULL
  AND entry."endedAt" > entry."startedAt";

DELETE FROM "InvoiceTime"
WHERE "id" IS NULL
   OR "sliceStart" IS NULL
   OR "sliceEnd" IS NULL
   OR "sliceEnd" <= "sliceStart";

ALTER TABLE "InvoiceTime" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "InvoiceTime" ALTER COLUMN "sliceStart" SET NOT NULL;
ALTER TABLE "InvoiceTime" ALTER COLUMN "sliceEnd" SET NOT NULL;

ALTER TABLE "InvoiceTime" DROP CONSTRAINT "InvoiceTime_pkey";
ALTER TABLE "InvoiceTime" ADD CONSTRAINT "InvoiceTime_pkey" PRIMARY KEY ("id");

ALTER TABLE "InvoiceTime"
  ADD CONSTRAINT "InvoiceTime_slice_order" CHECK ("sliceEnd" > "sliceStart");

-- sliceStart/sliceEnd are timestamp without time zone (Prisma DateTime).
-- tsrange is immutable on those columns. tstzrange is not: the cast to
-- timestamptz depends on the session TimeZone, so Postgres refuses it in an index.
ALTER TABLE "InvoiceTime"
  ADD CONSTRAINT "InvoiceTime_no_overlap"
  EXCLUDE USING gist (
    "timeEntryId" WITH =,
    tsrange("sliceStart", "sliceEnd", '[)') WITH &&
  );

CREATE INDEX "InvoiceTime_timeEntryId_idx" ON "InvoiceTime"("timeEntryId");

CREATE OR REPLACE FUNCTION "time_entry_invoice_lock"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Any issued slice locks the whole entry. Unbilled time, drafts, and void do not.
  IF EXISTS (
    SELECT 1
    FROM "InvoiceTime" AS link
    JOIN "Invoice" AS invoice ON invoice."id" = link."invoiceId"
    WHERE link."timeEntryId" = OLD."id"
      AND invoice."status" IN ('open', 'paid', 'partially_paid')
  ) THEN
    RAISE EXCEPTION 'INVOICED_TIME'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
