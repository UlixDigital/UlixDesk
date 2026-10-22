-- To-dos belong to a project. A time entry may point at one.
-- Delete stays refused while any time entry still references the row.

CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TodoAssignee" (
    "todoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TodoAssignee_pkey" PRIMARY KEY ("todoId","userId")
);

CREATE INDEX "Todo_projectId_idx" ON "Todo"("projectId");
CREATE INDEX "Todo_createdById_idx" ON "Todo"("createdById");
CREATE INDEX "Todo_status_idx" ON "Todo"("status");
CREATE INDEX "Todo_archivedAt_idx" ON "Todo"("archivedAt");
CREATE INDEX "TodoAssignee_userId_idx" ON "TodoAssignee"("userId");

ALTER TABLE "Todo" ADD CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TodoAssignee" ADD CONSTRAINT "TodoAssignee_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TodoAssignee" ADD CONSTRAINT "TodoAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Todo" ADD CONSTRAINT "Todo_status_check" CHECK ("status" IN ('open', 'done'));
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_title_check" CHECK (
    char_length(btrim("title")) > 0 AND char_length("title") <= 200
);
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_description_check" CHECK (
    "description" IS NULL OR char_length("description") <= 2000
);

ALTER TABLE "TimeEntry" ADD COLUMN "todoId" TEXT;
CREATE INDEX "TimeEntry_todoId_idx" ON "TimeEntry"("todoId");
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The app role is not the table owner. Grant it the same DML the other tables have.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Todo" TO ulixdesk_staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "TodoAssignee" TO ulixdesk_staging_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_production_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Todo" TO ulixdesk_production_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "TodoAssignee" TO ulixdesk_production_app;
  END IF;
END
$$;
