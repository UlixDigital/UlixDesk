#!/bin/sh
# Runs on the VPS.
#   remote-deploy.sh staging|production ghcr.io/owner/repo:<40-char sha>
#   remote-deploy.sh staging|production --rollback
# Forward deploys append to a history file. Rollback removes the latest line
# and starts the image that is now last, so a second rollback steps further back.
# A forward deploy that does not become healthy prints the container logs,
# starts the previous image when history has one, and exits non-zero.
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

print_service_logs() {
  echo "Last logs for $service:" >&2
  docker compose -f docker-compose.prod.yml logs --tail 200 "$service" >&2 || true
}

# The image health check requests /api/health. A crash loop resets Docker's
# start period on every restart, so this also watches the restart count.
wait_healthy() {
  deadline=$(( $(date +%s) + 150 ))
  status=missing
  while [ "$(date +%s)" -lt "$deadline" ]; do
    id=$(docker compose -f docker-compose.prod.yml ps -q "$service" 2>/dev/null | head -n 1 || true)
    if [ -n "$id" ]; then
      restarts=$(docker inspect --format '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)
      if [ "$restarts" -ge 3 ]; then
        echo "$service restarted $restarts times during startup." >&2
        print_service_logs
        return 1
      fi
      status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo missing)
      if [ "$status" = "unhealthy" ]; then
        echo "$service is unhealthy." >&2
        print_service_logs
        return 1
      fi
      if [ "$status" = "healthy" ]; then
        docker compose -f docker-compose.prod.yml exec -T "$service" \
          node -e 'fetch("http://127.0.0.1:3000/api/health",{redirect:"manual"}).then(async (r)=>{const body=await r.text(); console.log(r.status+" "+body); if(r.status!==200) process.exit(1);}).catch((error)=>{console.error(error); process.exit(1);})' \
          || {
            echo "$service reported healthy but /api/health did not return 200." >&2
            print_service_logs
            return 1
          }
        echo "$service is healthy."
        return 0
      fi
    else
      status=missing
    fi
    echo "Waiting for $service (health=$status)."
    sleep 3
  done
  echo "$service did not become healthy within 150s (last status=$status)." >&2
  print_service_logs
  return 1
}

start_service() {
  export_tags || return 1
  docker compose -f docker-compose.prod.yml up -d --wait postgres || return 1
  docker compose -f docker-compose.prod.yml up -d --no-deps backup || return 1
  docker compose -f docker-compose.prod.yml pull "$service" || return 1
  docker compose -f docker-compose.prod.yml up -d --no-deps "$service" || return 1
  wait_healthy || return 1
  docker compose -f docker-compose.prod.yml up -d --no-deps caddy || return 1
  docker compose -f docker-compose.prod.yml ps "$service" || return 1
}

# Drop the latest history line and start the image that is now last.
# Used by an explicit rollback and by a failed forward deploy.
roll_back() {
  if [ ! -s "$history" ]; then
    echo "No deploy history to roll back." >&2
    return 1
  fi
  count=$(grep -c . "$history" || true)
  if [ "$count" -lt 2 ]; then
    echo "No earlier image to roll back to." >&2
    return 1
  fi
  sed '$d' "$history" > "$history.tmp" || return 1
  mv "$history.tmp" "$history" || return 1
  image=$(tail -n 1 "$history")
  image_ok "$image" || {
    echo "History contains an unexpected image reference." >&2
    return 1
  }
  printf '%s\n' "$image" > "$tagfile"
  echo "Starting previous image $image."
  start_service || return 1
}

if [ "$action" = "--rollback" ]; then
  roll_back || exit 1
  exit 0
fi

image="$action"
image_ok "$image" || {
  echo "Image must look like ghcr.io/owner/repo:<40-character sha>." >&2
  exit 1
}
printf '%s\n' "$image" > "$tagfile"
previous=$(tail -n 1 "$history" 2>/dev/null || true)
if [ "$previous" != "$image" ]; then
  printf '%s\n' "$image" >> "$history"
fi
if start_service; then
  exit 0
fi
echo "Deploy of $image failed." >&2
if [ -n "$previous" ] && [ "$previous" != "$image" ]; then
  echo "Rolling back to $previous." >&2
  if roll_back; then
    echo "Rolled back to $previous. The deploy is still a failure." >&2
    exit 1
  fi
  echo "Automatic rollback failed. Inspect $service before trying another deploy." >&2
  exit 1
fi
if [ "$previous" = "$image" ]; then
  echo "This image is already the latest history entry, so it was not rolled back further." >&2
  exit 1
fi
echo "No earlier image to roll back to. $service was left on $image." >&2
exit 1
