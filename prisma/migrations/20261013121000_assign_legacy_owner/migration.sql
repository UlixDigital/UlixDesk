-- Assign time tracked before accounts existed to the earliest active owner.
-- A fresh database has no owner yet, so these statements change nothing.
-- scripts/bootstrap-owner.mjs repeats the same assignment after it creates that owner.

UPDATE "TimeEntry" AS entry
SET "userId" = owner.id
FROM (
  SELECT id
  FROM "User"
  WHERE role = 'owner' AND "deactivatedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
) AS owner
WHERE entry."userId" IS NULL;

-- Move the legacy workspace timer onto that owner when they do not already have one.
-- timeEntryId is unique, so the old row is deleted before the new one is inserted.
WITH owner AS (
  SELECT id
  FROM "User"
  WHERE role = 'owner' AND "deactivatedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
),
removed AS (
  DELETE FROM "RunningTimer" AS timer
  WHERE timer.id = 'workspace'
    AND EXISTS (SELECT 1 FROM owner)
    AND NOT EXISTS (
      SELECT 1
      FROM "RunningTimer" AS existing
      JOIN owner ON existing.id = owner.id
    )
  RETURNING timer."timeEntryId"
)
INSERT INTO "RunningTimer" ("id", "timeEntryId")
SELECT owner.id, removed."timeEntryId"
FROM removed
CROSS JOIN owner;

-- If the workspace timer is still here, the owner already had a timer.
-- Close the legacy entry and drop the extra timer.
UPDATE "TimeEntry" AS entry
SET "endedAt" = COALESCE(entry."endedAt", CURRENT_TIMESTAMP)
FROM "RunningTimer" AS timer
WHERE timer.id = 'workspace'
  AND timer."timeEntryId" = entry.id
  AND entry."endedAt" IS NULL;

DELETE FROM "RunningTimer" WHERE id = 'workspace';
