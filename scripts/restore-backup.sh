#!/bin/sh
# Restore one database from a pg_dump custom-format file.
# Run this on the VPS, from /opt/ulixdesk, after stopping the app that uses that database.
# Example:
#   docker compose -f docker-compose.prod.yml stop app-production
#   ./scripts/restore-backup.sh ulixdesk_production /backup/daily/ulixdesk_production-20261013.dump
#   docker compose -f docker-compose.prod.yml start app-production
set -eu

database="${1:?database name, ulixdesk_staging or ulixdesk_production}"
file="${2:?path inside the backup volume, for example /backup/daily/ulixdesk_production-20261013.dump}"

case "$database" in
  ulixdesk_staging | ulixdesk_production) ;;
  *)
    echo "Refusing to restore an unknown database." >&2
    exit 1
    ;;
esac

docker compose -f docker-compose.prod.yml exec -T backup \
  sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --clean --if-exists --no-owner --host=postgres --username="$POSTGRES_USER" --dbname="$1" "$2"' \
  restore "$database" "$file"
