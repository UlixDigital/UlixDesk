-- One budget per project and per client. Hours are seconds. Cost is minor units.
-- The check keeps the two shapes apart: a client budget cannot hard-stop time.

CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "projectId" TEXT,
    "clientId" TEXT,
    "basis" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT,
    "recurrence" TEXT NOT NULL,
    "startsOn" DATE,
    "billableOnly" BOOLEAN NOT NULL DEFAULT true,
    "alertPercent" INTEGER,
    "hardStop" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_projectId_key" ON "Budget"("projectId");
CREATE UNIQUE INDEX "Budget_clientId_key" ON "Budget"("clientId");
CREATE INDEX "Budget_scope_idx" ON "Budget"("scope");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_shape_check" CHECK (
    "amount" > 0
    AND "recurrence" IN ('total', 'weekly', 'monthly')
    AND ("alertPercent" IS NULL OR ("alertPercent" >= 1 AND "alertPercent" <= 99))
    AND (
        ("scope" = 'project' AND "projectId" IS NOT NULL AND "clientId" IS NULL)
        OR ("scope" = 'client' AND "clientId" IS NOT NULL AND "projectId" IS NULL)
    )
    AND (
        ("basis" = 'hours' AND "currency" IS NULL)
        OR ("basis" = 'cost' AND "currency" IS NOT NULL AND char_length("currency") = 3)
    )
    AND ("scope" = 'project' OR "hardStop" = false)
);

-- The app role is not the table owner. Grant it the same DML the other tables have.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Budget" TO ulixdesk_staging_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_production_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Budget" TO ulixdesk_production_app;
  END IF;
END
$$;
