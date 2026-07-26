#!/usr/bin/env bash
set -euo pipefail

# End-to-end backup, restore, upgrade and rollback drill.
#
# Runs entirely on disposable stacks: a run-scoped Compose project with its own
# volumes, created and destroyed by this script. It never touches an operator
# volume, and it refuses to start if the project name it was given already
# exists, so it cannot adopt somebody else's containers.
#
# Stages
#   1  seed real user objects through the API, plus DB and Redis markers
#   2  logical dump (pg_dump custom) and archive validation
#   3  quiesced volume snapshot with the app and Redis stopped
#   4  destroy the source volumes, restore into empty ones, verify by checksum
#   5  repeat-startup idempotency
#   6  recovery from a destructive database failure (pgdata wiped)
#   7  application rollback onto an already-migrated database (optional)
#   8  1.x SQLite import, with the db-only backup as the negative control
#
# Usage
#   QA_IMAGE=<64-hex digest>       docker.io/snapotter/snapotter@sha256:<digest>
#   QA_IMAGE_REF=<full reference>  any local tag, for a locally built candidate
#   QA_PREVIOUS_IMAGE_REF=<ref>    enables stage 7
#   QA_LEGACY_FIXTURE_DIR=<dir>    enables stage 8 (see backup-restore-legacy-fixture.mts)
#   QA_COMPOSE_FILE=<path>         defaults to tests/qa/docker-compose.qa.yml
#   QA_RESULTS=<path>              JSONL stage log

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE=${QA_COMPOSE_FILE:-"$SCRIPT_DIR/docker-compose.qa.yml"}
RUN_ID=${QA_BACKUP_RUN_ID:-"$(date -u +%Y%m%d%H%M%S)-$$"}

case "$RUN_ID" in
  *[!a-zA-Z0-9_-]*)
    echo "QA_BACKUP_RUN_ID may contain only letters, digits, underscore, and hyphen" >&2
    exit 2
    ;;
esac

if [ -n "${QA_IMAGE_REF:-}" ]; then
  CANDIDATE_IMAGE="$QA_IMAGE_REF"
else
  : "${QA_IMAGE:?Set QA_IMAGE to the release-candidate digest, or QA_IMAGE_REF to a full reference}"
  QA_IMAGE_REPOSITORY=${QA_IMAGE_REPOSITORY:-snapotter/snapotter}
  CANDIDATE_IMAGE="$QA_IMAGE_REPOSITORY@sha256:$QA_IMAGE"
fi
export QA_IMAGE_REF="$CANDIDATE_IMAGE"

export QA_PROJECT_NAME="snapotter-backup-$RUN_ID"
export QA_APP_PORT=${QA_APP_PORT:-0}
BACKUP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/snapotter-backup-drill.XXXXXX")
# Where the volume archives are staged. Docker Desktop on macOS serves bind
# mounts over virtiofs, which reproducibly hands back a corrupt multi-hundred-MB
# tar even when it hashed correctly moments earlier, so the default is a Docker
# volume the daemon owns end to end. Set QA_BACKUP_STAGING=bind to put the
# archives on the host filesystem instead.
BACKUP_VOLUME="snapotter-backup-stage-$RUN_ID"
BACKUP_STAGING=${QA_BACKUP_STAGING:-volume}
KEEP_BACKUP=${KEEP_QA_BACKUP:-0}
RESULTS=${QA_RESULTS:-"$BACKUP_DIR/drill-results.jsonl"}
BASE_URL=""

# The base Compose file is snapshotted into the run directory before anything
# else: other QA lanes edit the shared file, and a drill that destroys volumes
# must not have its definition change underneath it mid-run. The override
# supplies the image, so a locally built candidate with no registry digest is
# just as usable as a published one.
BASE_COMPOSE="$BACKUP_DIR/base.compose.yml"
OVERRIDE_COMPOSE="$BACKUP_DIR/override.compose.yml"
cp -- "$COMPOSE_FILE" "$BASE_COMPOSE"
cat > "$OVERRIDE_COMPOSE" <<YAML
services:
  app:
    image: \${QA_IMAGE_REF}
YAML
# The base file interpolates a digest before the override is merged, so it needs
# a syntactically valid placeholder even when the override replaces the result.
export QA_IMAGE=${QA_IMAGE:-0000000000000000000000000000000000000000000000000000000000000000}

compose() {
  docker compose -f "$BASE_COMPOSE" -f "$OVERRIDE_COMPOSE" -p "$QA_PROJECT_NAME" "$@"
}

compose_project() {
  local project="$1"
  shift
  docker compose -f "$BASE_COMPOSE" -f "$OVERRIDE_COMPOSE" -p "$project" "$@"
}

record() {
  printf '{"stage":"%s","status":"%s","detail":"%s","at":"%s"}\n' \
    "$1" "$2" "${3//\"/\'}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$RESULTS"
  echo "[$2] $1: ${3:-}" >&2
}

fail() {
  record "$1" "fail" "${2:-}"
  exit 1
}

# Mount arguments for the archive staging area, whichever backend is in use.
stage_mount() {
  if [ "$BACKUP_STAGING" = "volume" ]; then
    printf '%s\n' "-v" "$BACKUP_VOLUME:/backup"
  else
    printf '%s\n' "-v" "$BACKUP_DIR:/backup"
  fi
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  if [ "$BACKUP_STAGING" = "volume" ] && [ "$KEEP_BACKUP" != "1" ]; then
    docker volume rm -f "$BACKUP_VOLUME" >/dev/null 2>&1 || true
  fi
  for project in "${LEGACY_PROJECTS[@]:-}"; do
    [ -n "$project" ] || continue
    compose_project "$project" down --volumes --remove-orphans >/dev/null 2>&1 || true
  done
  if [ "$KEEP_BACKUP" = "1" ]; then
    echo "Backup artifacts retained at $BACKUP_DIR" >&2
  else
    rm -rf -- "$BACKUP_DIR"
  fi
}
trap cleanup EXIT HUP INT TERM

# Refuse to adopt an existing project: a drill that deletes volumes must be
# certain every volume it deletes is one it created.
LEGACY_PROJECTS=()
if compose ps -aq 2>/dev/null | grep -q .; then
  echo "Project $QA_PROJECT_NAME already has containers; refusing to adopt them" >&2
  exit 2
fi

wait_for_postgres() {
  local attempts=0
  until compose exec -T postgres pg_isready -U snapotter -d snapotter >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge 60 ] && return 1
    sleep 2
  done
}

wait_for_app() {
  local attempts=0
  until compose exec -T app curl -fsS --max-time 5 http://localhost:1349/api/v1/health >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 90 ]; then
      compose logs --tail 60 app >&2 || true
      return 1
    fi
    sleep 2
  done
}

resolve_base_url() {
  local binding
  binding=$(compose port app 1349 2>/dev/null) || return 1
  BASE_URL="http://127.0.0.1:${binding##*:}"
}

api() {
  curl -sS --max-time 60 "$@"
}

# macOS ships shasum, Linux ships sha256sum; the drill has to run on both.
if command -v sha256sum >/dev/null 2>&1; then
  host_sha256() { sha256sum | awk '{print $1}'; }
else
  host_sha256() { shasum -a 256 | awk '{print $1}'; }
fi

# ── Stage 1: seed ────────────────────────────────────────────────────────────
record "boot-candidate" "start" "$CANDIDATE_IMAGE"
compose up -d --wait --wait-timeout 300 || fail "boot-candidate" "stack did not come up"
wait_for_app || fail "boot-candidate" "app never became healthy"
resolve_base_url || fail "boot-candidate" "no published app port"
RUNNING_IMAGE=$(docker inspect --type container --format '{{.Image}}' "$(compose ps -q app)")
record "boot-candidate" "pass" "image=$RUNNING_IMAGE url=$BASE_URL"

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U snapotter -d snapotter <<'SQL' >/dev/null
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

# A real library object, uploaded and read back the way a user would, so the
# restore proves the object store and the database rows still agree.
LIBRARY_SOURCE="$BACKUP_DIR/library-object.png"
compose exec -T app sh -c 'cat /app/apps/web/dist/logo.png 2>/dev/null || head -c 65536 /dev/urandom' \
  > "$LIBRARY_SOURCE"
test -s "$LIBRARY_SOURCE" || fail "seed-library" "could not build a library upload payload"
EXPECTED_LIBRARY_SHA=$(host_sha256 < "$LIBRARY_SOURCE")
UPLOAD_JSON=$(api -X POST "$BASE_URL/api/v1/files/upload" -F "file=@$LIBRARY_SOURCE") \
  || fail "seed-library" "upload request failed"
LIBRARY_ID=$(printf '%s' "$UPLOAD_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$LIBRARY_ID" ] || fail "seed-library" "upload returned no file id: $UPLOAD_JSON"
record "seed-library" "pass" "id=$LIBRARY_ID sha=$EXPECTED_LIBRARY_SHA"

verify_library_object() {
  local stage="$1" actual
  actual=$(api "$BASE_URL/api/v1/files/$LIBRARY_ID/download" | host_sha256)
  [ "$actual" = "$EXPECTED_LIBRARY_SHA" ] || fail "$stage" "library checksum $actual != $EXPECTED_LIBRARY_SHA"
}

# ── Stage 2: logical dump ────────────────────────────────────────────────────
compose exec -T postgres pg_dump --format=custom --no-owner -U snapotter snapotter \
  > "$BACKUP_DIR/snapotter.dump" || fail "pg-dump" "pg_dump failed"
test -s "$BACKUP_DIR/snapotter.dump" || fail "pg-dump" "dump is empty"
compose exec -T postgres pg_restore --list < "$BACKUP_DIR/snapotter.dump" >/dev/null \
  || fail "pg-dump" "dump does not list"
record "pg-dump" "pass" "$(wc -c < "$BACKUP_DIR/snapotter.dump" | tr -d ' ') bytes"

# ── Stage 3: quiesced volume snapshot ────────────────────────────────────────
compose stop app >/dev/null
compose exec -T redis redis-cli SAVE >/dev/null
compose stop redis >/dev/null
APP_CONTAINER=$(compose ps -aq app)
REDIS_CONTAINER=$(compose ps -aq redis)
[ -n "$APP_CONTAINER" ] && [ -n "$REDIS_CONTAINER" ] || fail "snapshot" "container ids missing"

mapfile -t STAGE < <(stage_mount)
if [ "$BACKUP_STAGING" = "volume" ]; then
  docker volume create "$BACKUP_VOLUME" >/dev/null
  docker run --rm --entrypoint /bin/sh "${STAGE[@]}" -v "$BACKUP_DIR:/host:ro" "$CANDIDATE_IMAGE" \
    -c 'cp /host/snapotter.dump /backup/snapotter.dump' || fail "snapshot" "could not stage the dump"
fi

docker run --rm --entrypoint /bin/sh \
  --volumes-from "$APP_CONTAINER" "${STAGE[@]}" "$CANDIDATE_IMAGE" \
  -c 'tar czf /backup/snapotter-data.tar.gz -C /data .' || fail "snapshot" "data archive failed"
docker run --rm --entrypoint /bin/sh \
  --volumes-from "$REDIS_CONTAINER" "${STAGE[@]}" "$CANDIDATE_IMAGE" \
  -c 'tar czf /backup/snapotter-redis.tar.gz -C /data .' || fail "snapshot" "redis archive failed"
docker run --rm --entrypoint /bin/sh "${STAGE[@]}" "$CANDIDATE_IMAGE" \
  -c 'cd /backup && sha256sum snapotter.dump snapotter-data.tar.gz snapotter-redis.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS' \
  >/dev/null || fail "snapshot" "checksum manifest failed"

# Read the archives back from a container that did not write them, before
# anything irreversible happens. A backup you have not read is not a backup,
# and the next stage destroys the source volumes. macOS bind mounts in
# particular can hand back bytes that hashed correctly moments earlier.
docker run --rm --entrypoint /bin/sh "${STAGE[@]}" "$CANDIDATE_IMAGE" \
  -c 'cd /backup && sha256sum -c SHA256SUMS && tar tzf snapotter-data.tar.gz >/dev/null && tar tzf snapotter-redis.tar.gz >/dev/null' \
  >/dev/null 2>&1 || fail "snapshot" "archives do not read back intact; refusing to destroy the source volumes"
record "snapshot" "pass" "app and redis stopped before the tar; archives re-read and listed from a second container"

# ── Stage 4: destroy and restore ─────────────────────────────────────────────
compose down --volumes --remove-orphans >/dev/null
compose create app postgres redis >/dev/null
APP_CONTAINER=$(compose ps -aq app)
REDIS_CONTAINER=$(compose ps -aq redis)

docker run --rm --entrypoint /bin/sh \
  --volumes-from "$APP_CONTAINER" "${STAGE[@]}" "$CANDIDATE_IMAGE" \
  -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/snapotter-data.tar.gz -C /data' \
  || fail "restore" "data restore failed"
docker run --rm --entrypoint /bin/sh \
  --volumes-from "$REDIS_CONTAINER" "${STAGE[@]}" "$CANDIDATE_IMAGE" \
  -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/snapotter-redis.tar.gz -C /data' \
  || fail "restore" "redis restore failed"

compose up -d postgres redis >/dev/null
wait_for_postgres || fail "restore" "postgres never became ready"
compose exec -T postgres pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < "$BACKUP_DIR/snapotter.dump" >/dev/null \
  || fail "restore" "pg_restore failed"
compose up -d app >/dev/null
wait_for_app || fail "restore" "app never became healthy after restore"
resolve_base_url || fail "restore" "no published app port after restore"

RESTORED_MARKER=$(compose exec -T postgres psql -At -v ON_ERROR_STOP=1 -U snapotter -d snapotter \
  -c "SELECT marker FROM qa_backup_marker WHERE marker = 'release-candidate'")
[ "$RESTORED_MARKER" = "release-candidate" ] || fail "restore" "database marker missing"
RESTORED_REDIS=$(compose exec -T redis redis-cli --raw GET qa:backup:marker)
[ "$RESTORED_REDIS" = "release-candidate" ] || fail "restore" "redis marker missing"
RESTORED_DATA_SHA=$(compose exec -T app sha256sum /data/files/qa-backup-marker.txt | awk '{print $1}')
[ "$RESTORED_DATA_SHA" = "$EXPECTED_DATA_SHA" ] || fail "restore" "data file checksum changed"
if compose exec -T app test -e /tmp/workspace/uploads/qa-transient.txt; then
  fail "restore" "ephemeral workspace survived volume replacement"
fi
verify_library_object "restore"
record "restore" "pass" "db marker, redis marker, /data checksum and API library checksum all match"

# ── Stage 5: repeat-startup idempotency ──────────────────────────────────────
BEFORE_ROWS=$(compose exec -T postgres psql -At -U snapotter -d snapotter \
  -c "SELECT (SELECT count(*) FROM users) || ':' || (SELECT count(*) FROM user_files)")
for attempt in 1 2; do
  compose restart app >/dev/null
  wait_for_app || fail "repeat-startup" "app unhealthy on restart $attempt"
done
AFTER_ROWS=$(compose exec -T postgres psql -At -U snapotter -d snapotter \
  -c "SELECT (SELECT count(*) FROM users) || ':' || (SELECT count(*) FROM user_files)")
[ "$BEFORE_ROWS" = "$AFTER_ROWS" ] || fail "repeat-startup" "row counts moved $BEFORE_ROWS -> $AFTER_ROWS"
resolve_base_url || fail "repeat-startup" "no published app port"
verify_library_object "repeat-startup"
record "repeat-startup" "pass" "two restarts, rows stable at $AFTER_ROWS, library object still readable"

# ── Stage 6: destructive database failure ────────────────────────────────────
compose stop app >/dev/null
compose stop postgres >/dev/null
PG_CONTAINER=$(compose ps -aq postgres)
docker run --rm --entrypoint /bin/sh --volumes-from "$PG_CONTAINER" "$CANDIDATE_IMAGE" \
  -c 'find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +' \
  || fail "disaster-recovery" "could not wipe the data directory"
compose up -d postgres >/dev/null
wait_for_postgres || fail "disaster-recovery" "postgres did not reinitialise"
compose exec -T postgres pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < "$BACKUP_DIR/snapotter.dump" >/dev/null \
  || fail "disaster-recovery" "pg_restore into the reinitialised cluster failed"
compose up -d app >/dev/null
wait_for_app || fail "disaster-recovery" "app unhealthy after disaster recovery"
resolve_base_url || fail "disaster-recovery" "no published app port"
RECOVERED_MARKER=$(compose exec -T postgres psql -At -U snapotter -d snapotter \
  -c "SELECT marker FROM qa_backup_marker WHERE marker = 'release-candidate'")
[ "$RECOVERED_MARKER" = "release-candidate" ] || fail "disaster-recovery" "marker lost"
verify_library_object "disaster-recovery"
record "disaster-recovery" "pass" "pgdata destroyed, cluster reinitialised, dump restored, library intact"

# ── Stage 7: application rollback ────────────────────────────────────────────
if [ -n "${QA_PREVIOUS_IMAGE_REF:-}" ]; then
  compose stop app >/dev/null
  ROLLBACK_STATUS="pass"
  ROLLBACK_DETAIL="previous image booted healthy against the candidate-migrated database"
  if QA_IMAGE_REF="$QA_PREVIOUS_IMAGE_REF" compose up -d app >/dev/null 2>&1 && wait_for_app; then
    resolve_base_url || fail "rollback" "no published app port after rollback"
    verify_library_object "rollback"
  else
    ROLLBACK_STATUS="fail"
    ROLLBACK_DETAIL="previous image did not become healthy against the candidate-migrated database"
  fi
  record "rollback" "$ROLLBACK_STATUS" "$QA_PREVIOUS_IMAGE_REF: $ROLLBACK_DETAIL"
  # Return to the candidate so later stages describe the artifact under test.
  compose stop app >/dev/null
  compose up -d app >/dev/null
  wait_for_app || fail "rollback" "candidate did not come back after rollback"
else
  record "rollback" "skip" "set QA_PREVIOUS_IMAGE_REF to exercise it"
fi

compose down --volumes --remove-orphans >/dev/null

# ── Stage 8: 1.x SQLite import, with the db-only negative control ────────────
if [ -n "${QA_LEGACY_FIXTURE_DIR:-}" ]; then
  legacy_import() {
    local variant="$1" project="snapotter-backup-$RUN_ID-$1" app_container attempts=0
    LEGACY_PROJECTS+=("$project")
    compose_project "$project" create app postgres redis >/dev/null 2>&1
    app_container=$(compose_project "$project" ps -aq app)
    # DATA_DIR is /data in the image, and the boot importer probes
    # /data/snapotter.db before any default user is created, so dropping the
    # files in is the whole setup an operator would do.
    docker run --rm --entrypoint /bin/sh --volumes-from "$app_container" \
      -v "$QA_LEGACY_FIXTURE_DIR/$variant:/legacy:ro" "$CANDIDATE_IMAGE" \
      -c 'cp /legacy/snapotter.db /data/snapotter.db && { [ -s /legacy/snapotter.db-wal ] && cp /legacy/snapotter.db-wal /data/snapotter.db-wal || true; } && chown 999:999 /data/snapotter.db*' \
      >/dev/null 2>&1
    compose_project "$project" up -d >/dev/null 2>&1 || true
    until compose_project "$project" exec -T app \
      curl -fsS --max-time 5 http://localhost:1349/api/v1/health >/dev/null 2>&1; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 90 ]; then
        compose_project "$project" logs --tail 40 app >&2 || true
        echo "-1"
        return 0
      fi
      sleep 2
    done
    compose_project "$project" exec -T postgres psql -At -U snapotter -d snapotter \
      -c "SELECT count(*) FROM pipelines" 2>/dev/null | tr -d '\r' || echo "-1"
    compose_project "$project" down --volumes --remove-orphans >/dev/null 2>&1
  }

  FULL_PIPELINES=$(legacy_import "full" | tail -1)
  DBONLY_PIPELINES=$(legacy_import "db-only" | tail -1)
  if [ "$FULL_PIPELINES" -le 0 ]; then
    fail "legacy-import" "db+wal import produced $FULL_PIPELINES pipelines"
  fi
  if [ "$DBONLY_PIPELINES" -ge "$FULL_PIPELINES" ]; then
    fail "legacy-import" \
      "db-only import produced $DBONLY_PIPELINES pipelines, same as db+wal ($FULL_PIPELINES); the WAL fixture proves nothing"
  fi
  record "legacy-import" "pass" \
    "db+wal restored $FULL_PIPELINES pipelines, snapotter.db alone restored $DBONLY_PIPELINES: backing up the db file alone loses committed rows"
else
  record "legacy-import" "skip" "set QA_LEGACY_FIXTURE_DIR to exercise it"
fi

record "drill" "pass" "all enabled stages passed"
echo "Results: $RESULTS" >&2
