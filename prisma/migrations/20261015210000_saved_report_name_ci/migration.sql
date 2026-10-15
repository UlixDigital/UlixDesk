-- Names are unique per person regardless of case. The Prisma unique stays
-- case-sensitive; this index is what rejects "October" and "october".

CREATE UNIQUE INDEX "SavedReport_createdById_lower_name_key"
ON "SavedReport" ("createdById", lower("name"));
