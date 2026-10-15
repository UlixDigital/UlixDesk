-- Slice 13 client invoices.
-- Invoice numbers are allocated from WorkspaceSettings.nextInvoiceNumber.
-- Deleting a draft does not return the number. Invoice.number is unique.
-- Bank details default to placeholders. Do not put live account numbers in this file.
-- Time on an issued invoice (open, paid, partially_paid) cannot be updated or deleted.

ALTER TABLE "Client" ADD COLUMN "billingAddress" TEXT;

ALTER TABLE "WorkspaceSettings"
  ADD COLUMN "companyName" TEXT NOT NULL DEFAULT 'Ulix Digital',
  ADD COLUMN "companyAddress" TEXT NOT NULL DEFAULT '30 North Gould Street, Sheridan, WY 82801',
  ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'LE',
  ADD COLUMN "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1176,
  ADD COLUMN "invoiceNetTermsDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "invoiceNotes" TEXT NOT NULL DEFAULT $notes$* All payments are non refundable
* Use these details to send both Domestic wires and ACH transfers to Ulix Digital$notes$,
  ADD COLUMN "invoiceBankDetails" TEXT NOT NULL DEFAULT $bank$Beneficiary Name: Ulix Digital
Address: 30 North Gould Street, Sheridan, WY 82801

Account Number: [not set]
ABA Routing Number: [not set]
Type of Account: Checking
Bank Name: [not set]$bank$,
  ADD COLUMN "invoiceTaxEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invoiceTaxLabel" TEXT NOT NULL DEFAULT 'Tax',
  ADD COLUMN "invoiceTaxRateBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WorkspaceSettings"
  ADD CONSTRAINT "WorkspaceSettings_nextInvoiceNumber_check" CHECK ("nextInvoiceNumber" >= 1),
  ADD CONSTRAINT "WorkspaceSettings_invoiceNetTermsDays_check" CHECK ("invoiceNetTermsDays" >= 0 AND "invoiceNetTermsDays" <= 3650),
  ADD CONSTRAINT "WorkspaceSettings_invoiceTaxRateBps_check" CHECK ("invoiceTaxRateBps" >= 0 AND "invoiceTaxRateBps" <= 10000);

CREATE TABLE "InvoiceNumber" (
    "number" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceNumber_pkey" PRIMARY KEY ("number")
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "poNumber" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "grouping" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "bankDetails" TEXT NOT NULL,
    "discountKind" TEXT NOT NULL DEFAULT 'none',
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "discountAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "quantitySeconds" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceTime" (
    "timeEntryId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,

    CONSTRAINT "InvoiceTime_pkey" PRIMARY KEY ("timeEntryId")
);

CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX "InvoiceTime_invoiceId_idx" ON "InvoiceTime"("invoiceId");
CREATE INDEX "InvoiceTime_invoiceLineId_idx" ON "InvoiceTime"("invoiceLineId");
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('draft', 'open', 'paid', 'partially_paid', 'void')),
  ADD CONSTRAINT "Invoice_grouping_check" CHECK ("grouping" IN ('period', 'project', 'member', 'day')),
  ADD CONSTRAINT "Invoice_discountKind_check" CHECK ("discountKind" IN ('none', 'amount', 'percent')),
  ADD CONSTRAINT "Invoice_money_check" CHECK (
    "subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0 AND "paidMinor" >= 0
    AND "discountBps" >= 0 AND "discountBps" <= 10000
    AND "discountAmountMinor" >= 0
    AND "taxRateBps" >= 0 AND "taxRateBps" <= 10000
  );

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceLine_kind_check" CHECK ("kind" IN ('time', 'custom')),
  ADD CONSTRAINT "InvoiceLine_money_check" CHECK (
    "quantitySeconds" >= 0 AND "unitPriceMinor" >= 0 AND "amountMinor" >= 0
  );

ALTER TABLE "InvoiceTime"
  ADD CONSTRAINT "InvoiceTime_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceTime_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceTime_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoicePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoicePayment_amount_check" CHECK ("amountMinor" > 0);

CREATE OR REPLACE FUNCTION "time_entry_invoice_lock"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

CREATE TRIGGER "time_entry_invoice_lock"
BEFORE UPDATE OR DELETE ON "TimeEntry"
FOR EACH ROW
EXECUTE FUNCTION "time_entry_invoice_lock"();
