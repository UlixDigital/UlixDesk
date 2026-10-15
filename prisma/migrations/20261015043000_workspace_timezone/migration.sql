-- Workspace clock for timesheet days and bill-rate effective dates.
-- Existing rows become Asia/Colombo. The currency default stays USD.

ALTER TABLE "WorkspaceSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Asia/Colombo';
