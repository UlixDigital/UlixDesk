#!/bin/sh
# Runs on the VPS.
#   remote-deploy.sh staging|production ghcr.io/owner/repo:<40-char sha>
#   remote-deploy.sh staging|production --rollback
# Forward deploys append to a history file. Rollback removes the latest line
# and starts the image that is now last, so a second rollback steps further back.
set -eu

cd /opt/ulixdesk
target="${1:?staging or production}"
action="${2:?image reference or --rollback}"

case "$target" in
  staging) service=app-staging ;;
  production) service=app-production ;;
  *)
    echo "Use staging or production." >&2
    exit 1
    ;;
esac

tagfile="${target}-tag"
history="${target}-history"

image_ok() {
  printf '%s\n' "$1" | grep -Eq '^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+:[0-9a-f]{40}$'
}

export_tags() {
  staging_ref=$(cat staging-tag 2>/dev/null || true)
  production_ref=$(cat production-tag 2>/dev/null || true)
  ref="${staging_ref:-$production_ref}"
  ULIXDESK_IMAGE_REPOSITORY=${ref%:*}
  STAGING_IMAGE_TAG=${staging_ref##*:}
  PRODUCTION_IMAGE_TAG=${production_ref##*:}
  if [ -z "$STAGING_IMAGE_TAG" ] || [ "$STAGING_IMAGE_TAG" = "$staging_ref" ]; then
    STAGING_IMAGE_TAG=local
  fi
  if [ -z "$PRODUCTION_IMAGE_TAG" ] || [ "$PRODUCTION_IMAGE_TAG" = "$production_ref" ]; then
    PRODUCTION_IMAGE_TAG=local
  fi
  export ULIXDESK_IMAGE_REPOSITORY STAGING_IMAGE_TAG PRODUCTION_IMAGE_TAG
  cat > .env.images <<EOF
ULIXDESK_IMAGE_REPOSITORY=${ULIXDESK_IMAGE_REPOSITORY}
STAGING_IMAGE_TAG=${STAGING_IMAGE_TAG}
PRODUCTION_IMAGE_TAG=${PRODUCTION_IMAGE_TAG}
EOF
  # Compose reads .env for interpolation. Image tags are not secrets.
  cp .env.images .env
}

start_service() {
  export_tags
  docker compose -f docker-compose.prod.yml up -d --wait postgres
  docker compose -f docker-compose.prod.yml up -d --no-deps backup
  docker compose -f docker-compose.prod.yml pull "$service"
  docker compose -f docker-compose.prod.yml up -d --no-deps "$service"
  docker compose -f docker-compose.prod.yml up -d --no-deps caddy
  docker compose -f docker-compose.prod.yml ps "$service"
}

if [ "$action" = "--rollback" ]; then
  if [ ! -s "$history" ]; then
    echo "No deploy history to roll back." >&2
    exit 1
  fi
  count=$(grep -c . "$history" || true)
  if [ "$count" -lt 2 ]; then
    echo "No earlier image to roll back to." >&2
    exit 1
  fi
  sed '$d' "$history" > "$history.tmp"
  mv "$history.tmp" "$history"
  image=$(tail -n 1 "$history")
  image_ok "$image" || {
    echo "History contains an unexpected image reference." >&2
    exit 1
  }
  printf '%s\n' "$image" > "$tagfile"
  start_service
  exit 0
fi

image="$action"
image_ok "$image" || {
  echo "Image must look like ghcr.io/owner/repo:<40-character sha>." >&2
  exit 1
}
printf '%s\n' "$image" > "$tagfile"
last=$(tail -n 1 "$history" 2>/dev/null || true)
if [ "$last" != "$image" ]; then
  printf '%s\n' "$image" >> "$history"
fi
start_service
