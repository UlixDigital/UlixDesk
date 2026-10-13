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

seconds_until_0315() {
  now=$(date -u +%s)
  today=$(date -u -d 'today 03:15' +%s)
  if [ "$now" -lt "$today" ]; then
    echo $((today - now))
  else
    echo $((today + 86400 - now))
  fi
}

dump_once
while true; do
  sleep "$(seconds_until_0315)"
  dump_once
done
