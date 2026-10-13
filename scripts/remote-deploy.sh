#!/bin/sh
# Runs on the VPS. Usage: remote-deploy.sh staging|production <image>
# Read a previous tag with $(cat ...) before calling this. The shell expands
# that before this script replaces the tag file.
set -eu

cd /opt/ulixdesk
target="${1:?staging or production}"
image="${2:?image reference, for example ghcr.io/org/ulixdesk:sha}"

case "$target" in
  staging)
    service=app-staging
    tagfile=staging-tag
    previous=staging-previous-tag
    ;;
  production)
    service=app-production
    tagfile=production-tag
    previous=production-previous-tag
    ;;
  *)
    echo "Use staging or production." >&2
    exit 1
    ;;
esac

if [ -f "$tagfile" ]; then
  cp "$tagfile" "$previous"
fi
printf '%s\n' "$image" > "$tagfile"

ULIXDESK_STAGING_IMAGE=$(cat staging-tag 2>/dev/null || printf '%s' "$image")
ULIXDESK_PRODUCTION_IMAGE=$(cat production-tag 2>/dev/null || printf '%s' "$image")
export ULIXDESK_STAGING_IMAGE ULIXDESK_PRODUCTION_IMAGE

docker compose -f docker-compose.prod.yml pull "$service"
docker compose -f docker-compose.prod.yml up -d postgres caddy backup "$service"
docker compose -f docker-compose.prod.yml ps "$service"
