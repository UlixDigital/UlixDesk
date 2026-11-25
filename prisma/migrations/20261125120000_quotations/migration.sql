-- Quotations use their own number counter. Invoice numbers are unchanged.
-- Expired is not stored. A quotation whose valid-until date is before today,
-- and that has not been accepted or declined, is expired when it is read.
-- Bank account numbers are not stored on a quotation.

ALTER TABLE "WorkspaceSettings"
  ADD COLUMN "quotationPrefix" TEXT NOT NULL DEFAULT 'Q',
  ADD COLUMN "nextQuotationNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "WorkspaceSettings"
  ADD CONSTRAINT "WorkspaceSettings_nextQuotationNumber_check" CHECK ("nextQuotationNumber" >= 1),
  ADD CONSTRAINT "WorkspaceSettings_quotationPrefix_check" CHECK (char_length("quotationPrefix") BETWEEN 1 AND 12);

CREATE TABLE "QuotationNumber" (
    "number" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationNumber_pkey" PRIMARY KEY ("number")
);

CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "viewTokenHash" TEXT,
    "viewTokenCipher" TEXT,
    "viewTokenNonce" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quantityKind" TEXT NOT NULL DEFAULT 'item',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "quantitySeconds" INTEGER NOT NULL,
    "quantityMs" BIGINT NOT NULL DEFAULT 0,
    "rangeStart" DATE,
    "rangeEnd" DATE,
    "unitPriceMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationStatusEvent" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationEmail" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[],
    "subject" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");
CREATE UNIQUE INDEX "Quotation_invoiceId_key" ON "Quotation"("invoiceId");
CREATE UNIQUE INDEX "Quotation_viewTokenHash_key" ON "Quotation"("viewTokenHash");
CREATE INDEX "Quotation_clientId_idx" ON "Quotation"("clientId");
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");
CREATE INDEX "Quotation_issueDate_idx" ON "Quotation"("issueDate");
CREATE INDEX "Quotation_validUntil_idx" ON "Quotation"("validUntil");
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");
CREATE INDEX "QuotationStatusEvent_quotationId_createdAt_idx" ON "QuotationStatusEvent"("quotationId", "createdAt");
CREATE INDEX "QuotationEmail_quotationId_createdAt_idx" ON "QuotationEmail"("quotationId", "createdAt");

ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Quotation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuotationLine"
  ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuotationStatusEvent"
  ADD CONSTRAINT "QuotationStatusEvent_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QuotationStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuotationEmail"
  ADD CONSTRAINT "QuotationEmail_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QuotationEmail_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_status_check" CHECK ("status" IN ('draft', 'sent', 'accepted', 'declined')),
  ADD CONSTRAINT "Quotation_valid_until_check" CHECK ("validUntil" >= "issueDate"),
  ADD CONSTRAINT "Quotation_tax_check" CHECK ("taxRateBps" >= 0 AND "taxRateBps" <= 10000),
  ADD CONSTRAINT "Quotation_money_check" CHECK (
    "subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0
  );

ALTER TABLE "QuotationLine"
  ADD CONSTRAINT "QuotationLine_quantity_kind_check" CHECK ("quantityKind" IN ('hours', 'item')),
  ADD CONSTRAINT "QuotationLine_money_check" CHECK ("unitPriceMinor" >= 0 AND "amountMinor" >= 0),
  ADD CONSTRAINT "QuotationLine_range_check" CHECK (
    ("rangeStart" IS NULL AND "rangeEnd" IS NULL) OR ("rangeStart" IS NOT NULL AND "rangeEnd" IS NOT NULL AND "rangeEnd" >= "rangeStart")
  );

-- The app role is not the table owner. Grant it the same DML the other tables have.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationNumber" TO ulixdesk_staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Quotation" TO ulixdesk_staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationLine" TO ulixdesk_staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationStatusEvent" TO ulixdesk_staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationEmail" TO ulixdesk_staging_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_production_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationNumber" TO ulixdesk_production_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Quotation" TO ulixdesk_production_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationLine" TO ulixdesk_production_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationStatusEvent" TO ulixdesk_production_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuotationEmail" TO ulixdesk_production_app;
  END IF;
END
$$;
