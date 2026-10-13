#!/bin/sh
# Nightly custom-format dumps. Keeps 7 daily files and 4 weekly files (Sunday).
set -eu

mkdir -p /backup/daily /backup/weekly
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

dump_once() {
  stamp=$(date -u +%Y%m%d)
  weekday=$(date -u +%u)
  for db in ulixdesk_staging ulixdesk_production; do
    file="/backup/daily/${db}-${stamp}.dump"
    pg_dump -Fc --no-owner --host=postgres --username="$POSTGRES_USER" --dbname="$db" --file="$file"
    if [ "$weekday" = "7" ]; then
      cp "$file" "/backup/weekly/${db}-${stamp}.dump"
    fi
  done
  find /backup/daily -name '*.dump' -mtime +7 -delete
  find /backup/weekly -name '*.dump' -mtime +28 -delete
  echo "Backup finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# Alpine's date is BusyBox and does not support GNU `date -d`.
seconds_until_0315() {
  hour=$(date -u +%H)
  minute=$(date -u +%M)
  second=$(date -u +%S)
  now_sod=$((10#$hour * 3600 + 10#$minute * 60 + 10#$second))
  target=$((3 * 3600 + 15 * 60))
  if [ "$now_sod" -lt "$target" ]; then
    echo $((target - now_sod))
  else
    echo $((86400 - now_sod + target))
  fi
}

dump_once
while true; do
  sleep "$(seconds_until_0315)"
  dump_once
done
