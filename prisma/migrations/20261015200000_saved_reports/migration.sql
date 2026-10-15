-- Saved report names, filters, grouping, and columns.
-- The app roles, when they already exist, can read and write the new table.

CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "params" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedReport_createdById_name_key" ON "SavedReport"("createdById", "name");
CREATE INDEX "SavedReport_visibility_idx" ON "SavedReport"("visibility");

ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SavedReport" TO ulixdesk_staging_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_production_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SavedReport" TO ulixdesk_production_app;
  END IF;
END
$$;
