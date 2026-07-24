#!/bin/sh
set -eu

: "${QA_IMAGE:?Set QA_IMAGE to the exact release-candidate image tag or digest}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.qa.yml"
RUN_ID=${QA_BACKUP_RUN_ID:-"$(date -u +%Y%m%d%H%M%S)-$$"}

case "$RUN_ID" in
  *[!a-zA-Z0-9_-]*)
    echo "QA_BACKUP_RUN_ID may contain only letters, digits, underscore, and hyphen" >&2
    exit 2
    ;;
esac

export QA_PROJECT_NAME="snapotter-backup-$RUN_ID"
export QA_APP_PORT=${QA_APP_PORT:-0}
QA_IMAGE_REPOSITORY=${QA_IMAGE_REPOSITORY:-snapotter/snapotter}
CANDIDATE_IMAGE="$QA_IMAGE_REPOSITORY@sha256:$QA_IMAGE"
BACKUP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/snapotter-backup-drill.XXXXXX")
KEEP_BACKUP=${KEEP_QA_BACKUP:-0}

compose() {
  docker compose -f "$COMPOSE_FILE" -p "$QA_PROJECT_NAME" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  if [ "$KEEP_BACKUP" = "1" ]; then
    echo "Backup artifacts retained at $BACKUP_DIR"
  else
    rm -rf -- "$BACKUP_DIR"
  fi
}
trap cleanup EXIT HUP INT TERM

wait_for_postgres() {
  attempts=0
  until compose exec -T postgres pg_isready -U snapotter -d snapotter >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      echo "PostgreSQL did not become ready" >&2
      return 1
    fi
    sleep 2
  done
}

wait_for_app() {
  attempts=0
  until compose exec -T app curl -fsS --max-time 5 http://localhost:1349/api/v1/health >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 90 ]; then
      echo "SnapOtter did not become healthy" >&2
      compose logs app >&2 || true
      return 1
    fi
    sleep 2
  done
}

echo "Starting isolated candidate stack $QA_PROJECT_NAME"
compose up -d --wait --wait-timeout 240

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U snapotter -d snapotter <<'SQL'
CREATE TABLE IF NOT EXISTS qa_backup_marker (
  marker text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO qa_backup_marker(marker) VALUES ('release-candidate')
ON CONFLICT (marker) DO UPDATE SET created_at = now();
SQL
compose exec -T redis redis-cli SET qa:backup:marker release-candidate >/dev/null
compose exec -T app sh -c \
  'mkdir -p /data/files /tmp/workspace/uploads && printf %s release-candidate > /data/files/qa-backup-marker.txt && printf %s transient > /tmp/workspace/uploads/qa-transient.txt'
EXPECTED_DATA_SHA=$(compose exec -T app sha256sum /data/files/qa-backup-marker.txt | awk '{print $1}')

echo "Creating and validating logical database archive"
compose exec -T postgres pg_dump --format=custom --no-owner -U snapotter snapotter > "$BACKUP_DIR/snapotter.dump"
test -s "$BACKUP_DIR/snapotter.dump"
compose exec -T postgres pg_restore --list < "$BACKUP_DIR/snapotter.dump" >/dev/null

echo "Quiescing application and durable queue before volume snapshots"
compose stop app
compose exec -T redis redis-cli SAVE >/dev/null
compose stop redis
APP_CONTAINER=$(compose ps -aq app)
REDIS_CONTAINER=$(compose ps -aq redis)
test -n "$APP_CONTAINER"
test -n "$REDIS_CONTAINER"

docker run --rm --entrypoint /bin/sh \
  --volumes-from "$APP_CONTAINER" -v "$BACKUP_DIR:/backup" "$CANDIDATE_IMAGE" \
  -c 'tar czf /backup/snapotter-data.tar.gz -C /data .'
docker run --rm --entrypoint /bin/sh \
  --volumes-from "$REDIS_CONTAINER" -v "$BACKUP_DIR:/backup" "$CANDIDATE_IMAGE" \
  -c 'tar czf /backup/snapotter-redis.tar.gz -C /data .'
docker run --rm --entrypoint /bin/sh -v "$BACKUP_DIR:/backup" "$CANDIDATE_IMAGE" \
  -c 'cd /backup && sha256sum snapotter.dump snapotter-data.tar.gz snapotter-redis.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS'

echo "Destroying the source volumes"
compose down --volumes --remove-orphans

echo "Creating empty replacement volumes"
compose create app postgres redis >/dev/null
APP_CONTAINER=$(compose ps -aq app)
REDIS_CONTAINER=$(compose ps -aq redis)

docker run --rm --entrypoint /bin/sh \
  --volumes-from "$APP_CONTAINER" -v "$BACKUP_DIR:/backup:ro" "$CANDIDATE_IMAGE" \
  -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/snapotter-data.tar.gz -C /data'
docker run --rm --entrypoint /bin/sh \
  --volumes-from "$REDIS_CONTAINER" -v "$BACKUP_DIR:/backup:ro" "$CANDIDATE_IMAGE" \
  -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/snapotter-redis.tar.gz -C /data'

compose up -d postgres redis
wait_for_postgres
compose exec -T postgres pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < "$BACKUP_DIR/snapotter.dump"
compose up -d app
wait_for_app

RESTORED_MARKER=$(compose exec -T postgres psql -At -v ON_ERROR_STOP=1 -U snapotter -d snapotter \
  -c "SELECT marker FROM qa_backup_marker WHERE marker = 'release-candidate'")
test "$RESTORED_MARKER" = "release-candidate"
RESTORED_REDIS=$(compose exec -T redis redis-cli --raw GET qa:backup:marker)
test "$RESTORED_REDIS" = "release-candidate"
RESTORED_DATA_SHA=$(compose exec -T app sha256sum /data/files/qa-backup-marker.txt | awk '{print $1}')
test "$RESTORED_DATA_SHA" = "$EXPECTED_DATA_SHA"
if compose exec -T app test -e /tmp/workspace/uploads/qa-transient.txt; then
  echo "Ephemeral workspace unexpectedly survived volume replacement" >&2
  exit 1
fi

echo "Backup/restore drill passed: database, Redis queue state, and saved-file checksum restored"
