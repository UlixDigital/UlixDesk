-- Slice 14: invoice status audit, client view tokens, and send history.
-- Void releases a billed window by setting InvoiceTime.active = false.
-- The overlap constraint then ignores that window. Reopen sets active back
-- to true, and InvoiceTime_no_overlap rejects the window if another invoice
-- has billed it. Existing rows stay active.
-- The client link is stored as a SHA-256 hash. A sealed copy is kept so
-- owners and admins can copy the same link. No plaintext token is stored.
-- This file does not contain SMTP passwords or live account numbers.

ALTER TABLE "Invoice" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "viewTokenHash" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "viewTokenCipher" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "viewTokenNonce" TEXT;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_viewToken_check" CHECK (
    (
      "viewTokenHash" IS NULL
      AND "viewTokenCipher" IS NULL
      AND "viewTokenNonce" IS NULL
    )
    OR (
      "viewTokenHash" IS NOT NULL
      AND "viewTokenCipher" IS NOT NULL
      AND "viewTokenNonce" IS NOT NULL
      AND "viewTokenHash" ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX "Invoice_viewTokenHash_key" ON "Invoice"("viewTokenHash");

ALTER TABLE "InvoiceTime" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "InvoiceTime" DROP CONSTRAINT "InvoiceTime_no_overlap";

ALTER TABLE "InvoiceTime"
  ADD CONSTRAINT "InvoiceTime_no_overlap"
  EXCLUDE USING gist (
    "timeEntryId" WITH =,
    tsrange("sliceStart", "sliceEnd", '[)') WITH &&
  ) WHERE ("active");

CREATE TABLE "InvoiceStatusEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceEmail" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "toAddresses" TEXT[] NOT NULL,
    "ccAddresses" TEXT[] NOT NULL,
    "subject" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceStatusEvent_invoiceId_createdAt_idx" ON "InvoiceStatusEvent"("invoiceId", "createdAt");
CREATE INDEX "InvoiceEmail_invoiceId_createdAt_idx" ON "InvoiceEmail"("invoiceId", "createdAt");

ALTER TABLE "InvoiceStatusEvent"
  ADD CONSTRAINT "InvoiceStatusEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceStatusEvent_reason_check" CHECK (char_length("reason") BETWEEN 1 AND 500),
  ADD CONSTRAINT "InvoiceStatusEvent_status_check" CHECK (
    "fromStatus" IN ('draft', 'open', 'paid', 'partially_paid', 'void')
    AND "toStatus" IN ('draft', 'open', 'paid', 'partially_paid', 'void')
    AND "fromStatus" <> "toStatus"
  );

ALTER TABLE "InvoiceEmail"
  ADD CONSTRAINT "InvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceEmail_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceEmail_subject_check" CHECK (char_length("subject") BETWEEN 1 AND 200),
  ADD CONSTRAINT "InvoiceEmail_to_check" CHECK (cardinality("toAddresses") BETWEEN 1 AND 20),
  ADD CONSTRAINT "InvoiceEmail_cc_check" CHECK (cardinality("ccAddresses") <= 20),
  ADD CONSTRAINT "InvoiceEmail_error_check" CHECK ("error" IS NULL OR char_length("error") <= 500);
