#!/bin/sh
# Create or update the non-owner app roles on an existing Postgres volume.
# Run from /opt/ulixdesk after this release has migrated. Then point
# DATABASE_URL at the app role and recreate the app. See docs/DEPLOY.md.
#
# docker-compose.prod.yml sets the project name to ulixdesk. Export
# COMPOSE_PROJECT_NAME first when the running stack uses another name
# (a local `docker compose up` from docker-compose.yml is ulixdesk-dev).
# COMPOSE_PROJECT_NAME overrides the name in the compose file.
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

: "${STAGING_APP_DB_PASSWORD:?Set STAGING_APP_DB_PASSWORD (letters and numbers only).}"
: "${PRODUCTION_APP_DB_PASSWORD:?Set PRODUCTION_APP_DB_PASSWORD (letters and numbers only).}"

case "${STAGING_APP_DB_PASSWORD}${PRODUCTION_APP_DB_PASSWORD}" in
  *[!A-Za-z0-9]*)
    echo "App database passwords must contain only letters and numbers." >&2
    exit 1
    ;;
esac

docker compose -f docker-compose.prod.yml exec -T \
  -e STAGING_APP_DB_PASSWORD \
  -e PRODUCTION_APP_DB_PASSWORD \
  postgres sh -s <<'EOS'
set -eu

ensure_role() {
  name="$1"
  password="$2"
  exists=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname = '${name}'")
  if [ "$exists" = "1" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c \
      "ALTER ROLE ${name} WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
  else
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c \
      "CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
  fi
}

ensure_role ulixdesk_staging_app "$STAGING_APP_DB_PASSWORD"
ensure_role ulixdesk_production_app "$PRODUCTION_APP_DB_PASSWORD"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
GRANT CONNECT ON DATABASE ulixdesk_staging TO ulixdesk_staging_app;
GRANT CONNECT ON DATABASE ulixdesk_production TO ulixdesk_production_app;
SQL

grant_one() {
  db="$1"
  owner="$2"
  app="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
GRANT USAGE ON SCHEMA public TO ${app};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app};
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE "TimeChange" FROM ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${app};
SQL
}

grant_one ulixdesk_staging ulixdesk_staging ulixdesk_staging_app
grant_one ulixdesk_production ulixdesk_production ulixdesk_production_app
echo "App roles can read and write. TimeChange is insert and select only."
EOS
