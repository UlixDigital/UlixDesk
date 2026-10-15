-- Slice 8 bill rates.
-- Existing clients receive USD, the workspace default. No bill-rate rows are created,
-- so existing time has no amount until an owner or admin sets a rate.
-- Project.billable already defaults to true. TimeEntry.billable is already required
-- and is left unchanged, so existing entries stay billable.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WorkspaceSettings" ("id", "defaultCurrency", "updatedAt")
VALUES ('workspace', 'USD', CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "BillRate" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "userId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillRate_clientId_effectiveFrom_idx" ON "BillRate"("clientId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "BillRate_projectId_effectiveFrom_idx" ON "BillRate"("projectId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "BillRate_userId_clientId_effectiveFrom_idx" ON "BillRate"("userId", "clientId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
