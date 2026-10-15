#!/bin/sh
# Runs once, the first time the Postgres volume is created.
# Passwords are letters and numbers only so they can be placed in SQL safely.
# Owner roles (ulixdesk_staging, ulixdesk_production) own the databases and run
# migrations. App roles cannot own tables and are what the Next.js process uses.
set -eu

: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"
: "${PRODUCTION_DB_PASSWORD:?PRODUCTION_DB_PASSWORD is required}"
: "${STAGING_APP_DB_PASSWORD:?STAGING_APP_DB_PASSWORD is required}"
: "${PRODUCTION_APP_DB_PASSWORD:?PRODUCTION_APP_DB_PASSWORD is required}"

case "${STAGING_DB_PASSWORD}${PRODUCTION_DB_PASSWORD}${STAGING_APP_DB_PASSWORD}${PRODUCTION_APP_DB_PASSWORD}" in
  *[!A-Za-z0-9]*)
    echo "Database passwords must contain only letters and numbers." >&2
    exit 1
    ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE ulixdesk_staging LOGIN PASSWORD '${STAGING_DB_PASSWORD}';
CREATE ROLE ulixdesk_production LOGIN PASSWORD '${PRODUCTION_DB_PASSWORD}';
CREATE ROLE ulixdesk_staging_app LOGIN PASSWORD '${STAGING_APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE ulixdesk_production_app LOGIN PASSWORD '${PRODUCTION_APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE ulixdesk_staging OWNER ulixdesk_staging;
CREATE DATABASE ulixdesk_production OWNER ulixdesk_production;
REVOKE ALL ON DATABASE ulixdesk_staging FROM PUBLIC;
REVOKE ALL ON DATABASE ulixdesk_production FROM PUBLIC;
GRANT CONNECT ON DATABASE ulixdesk_staging TO ulixdesk_staging;
GRANT CONNECT ON DATABASE ulixdesk_production TO ulixdesk_production;
GRANT CONNECT ON DATABASE ulixdesk_staging TO ulixdesk_staging_app;
GRANT CONNECT ON DATABASE ulixdesk_production TO ulixdesk_production_app;
SQL

grant_defaults() {
  db="$1"
  owner="$2"
  app="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
GRANT USAGE ON SCHEMA public TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${app};
SQL
}

grant_defaults ulixdesk_staging ulixdesk_staging ulixdesk_staging_app
grant_defaults ulixdesk_production ulixdesk_production ulixdesk_production_app
