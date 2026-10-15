-- TRUNCATE does not fire the row DELETE trigger, so the table owner could still
-- wipe the log. A statement trigger rejects TRUNCATE as well.
-- The app roles, when they already exist, keep SELECT and INSERT only.

CREATE TRIGGER "time_change_no_truncate"
BEFORE TRUNCATE ON "TimeChange"
FOR EACH STATEMENT
EXECUTE FUNCTION "time_change_append_only"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_staging_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE "TimeChange" FROM ulixdesk_staging_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_production_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE "TimeChange" FROM ulixdesk_production_app;
  END IF;
END
$$;
