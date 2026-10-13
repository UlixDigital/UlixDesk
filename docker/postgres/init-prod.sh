#!/bin/sh
# Runs once, the first time the Postgres volume is created.
# Passwords are letters and numbers only so they can be placed in SQL safely.
set -eu

: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"
: "${PRODUCTION_DB_PASSWORD:?PRODUCTION_DB_PASSWORD is required}"

case "${STAGING_DB_PASSWORD}${PRODUCTION_DB_PASSWORD}" in
  *[!A-Za-z0-9]*)
    echo "Database passwords must contain only letters and numbers." >&2
    exit 1
    ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE ulixdesk_staging LOGIN PASSWORD '${STAGING_DB_PASSWORD}';
CREATE ROLE ulixdesk_production LOGIN PASSWORD '${PRODUCTION_DB_PASSWORD}';
CREATE DATABASE ulixdesk_staging OWNER ulixdesk_staging;
CREATE DATABASE ulixdesk_production OWNER ulixdesk_production;
REVOKE ALL ON DATABASE ulixdesk_staging FROM PUBLIC;
REVOKE ALL ON DATABASE ulixdesk_production FROM PUBLIC;
GRANT CONNECT ON DATABASE ulixdesk_staging TO ulixdesk_staging;
GRANT CONNECT ON DATABASE ulixdesk_production TO ulixdesk_production;
SQL
