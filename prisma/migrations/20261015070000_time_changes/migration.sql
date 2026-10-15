-- Append-only log of time entry creates, edits, deletes, and timer start/stop.
-- Existing time entries have no rows here. History starts with the next change.
-- timeEntryId is plain text, not a foreign key, so deleting an entry keeps the log.
-- UPDATE and DELETE are rejected. The app only inserts.

-- CreateTable
CREATE TABLE "TimeChange" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entryUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeStartedAt" TIMESTAMP(3),
    "beforeEndedAt" TIMESTAMP(3),
    "beforeDurationMs" INTEGER,
    "beforeProjectId" TEXT,
    "beforeClientId" TEXT,
    "beforeNote" TEXT,
    "beforeBillable" BOOLEAN,
    "afterStartedAt" TIMESTAMP(3),
    "afterEndedAt" TIMESTAMP(3),
    "afterDurationMs" INTEGER,
    "afterProjectId" TEXT,
    "afterClientId" TEXT,
    "afterNote" TEXT,
    "afterBillable" BOOLEAN,

    CONSTRAINT "TimeChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeChange_changedAt_idx" ON "TimeChange"("changedAt");

-- CreateIndex
CREATE INDEX "TimeChange_entryUserId_changedAt_idx" ON "TimeChange"("entryUserId", "changedAt");

-- CreateIndex
CREATE INDEX "TimeChange_timeEntryId_idx" ON "TimeChange"("timeEntryId");

-- CreateIndex
CREATE INDEX "TimeChange_actorId_idx" ON "TimeChange"("actorId");

-- AddForeignKey
ALTER TABLE "TimeChange" ADD CONSTRAINT "TimeChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeChange" ADD CONSTRAINT "TimeChange_entryUserId_fkey" FOREIGN KEY ("entryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "time_change_append_only"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'time change rows are append-only';
END;
$$;

CREATE TRIGGER "time_change_no_update"
BEFORE UPDATE ON "TimeChange"
FOR EACH ROW
EXECUTE FUNCTION "time_change_append_only"();

CREATE TRIGGER "time_change_no_delete"
BEFORE DELETE ON "TimeChange"
FOR EACH ROW
EXECUTE FUNCTION "time_change_append_only"();
