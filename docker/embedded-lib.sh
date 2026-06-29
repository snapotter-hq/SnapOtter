#!/bin/sh
# Shared helpers for SnapOtter embedded mode (in-container Postgres + Redis).
# Sourced by docker/entrypoint.sh and the s6 service scripts. Kept in its own
# file so the decision logic can be unit-tested directly
# (tests/unit/security/embedded-mode.test.ts) rather than mirrored. Sourcing has
# no side effects, only function definitions. POSIX sh only (no bashisms).
#
# Functions use _-prefixed locals (sh has no portable `local`).

# decide_run_mode
# Echoes "embedded" or "external" and returns 0, OR prints a fatal partial-config
# error to stderr and returns 2. Embedded requires BOTH DATABASE_URL and
# REDIS_URL unset and EMBEDDED != 0. Exactly one URL set is an ambiguous
# misconfiguration and is rejected.
decide_run_mode() {
  if [ "${EMBEDDED:-auto}" = "0" ]; then
    echo "external"
    return 0
  fi
  if [ -z "${DATABASE_URL:-}" ] && [ -z "${REDIS_URL:-}" ]; then
    echo "embedded"
    return 0
  fi
  if [ -n "${DATABASE_URL:-}" ] && [ -n "${REDIS_URL:-}" ]; then
    echo "external"
    return 0
  fi
  echo "FATAL: set BOTH DATABASE_URL and REDIS_URL (external mode), or NEITHER (embedded mode)." >&2
  echo "Exactly one is set, which is ambiguous. Refusing to guess." >&2
  return 2
}

# embedded_requires_root <uid>
# Embedded mode needs root to initdb, chown PGDATA, run Postgres as the postgres
# user, and s6-setuidgid per service. Arbitrary-UID runtimes (OpenShift,
# Kubernetes runAsNonRoot, `docker run --user`) cannot do this. Returns 0 when
# uid is 0, otherwise prints guidance and returns 1.
embedded_requires_root() {
  _err_uid="$1"
  if [ "$_err_uid" = "0" ]; then
    return 0
  fi
  echo "FATAL: embedded mode needs root to run the in-container database (uid=$_err_uid)." >&2
  echo "Run the container as root (the default), or use the Compose 3-container stack," >&2
  echo "or set DATABASE_URL + REDIS_URL to point at external services." >&2
  return 1
}

# sqlite_autodetect_path <data_dir>
# Echoes the SQLite path the app should import on first boot, or empty. An
# explicit SQLITE_MIGRATE_PATH always wins. Otherwise, if <data_dir>/snapotter.db
# exists (a 1.x single-container database), echo it so embedded mode upgrades in
# place. The importer itself no-ops when the target Postgres is non-empty, so a
# second boot does not re-import.
sqlite_autodetect_path() {
  _sap_dir="$1"
  if [ -n "${SQLITE_MIGRATE_PATH:-}" ]; then
    echo "$SQLITE_MIGRATE_PATH"
    return 0
  fi
  if [ -f "$_sap_dir/snapotter.db" ]; then
    echo "$_sap_dir/snapotter.db"
    return 0
  fi
  echo ""
}

# check_pg_version <pgdata> <installed_major>
# Guards against a silent major-version mismatch. If <pgdata>/PG_VERSION exists
# and its major differs from <installed_major>, print actionable guidance and
# return 1 (never auto-pg_upgrade, never overwrite). Returns 0 when it matches or
# when the data dir is fresh (no PG_VERSION yet).
check_pg_version() {
  _cpv_data="$1"
  _cpv_installed="$2"
  if [ ! -f "$_cpv_data/PG_VERSION" ]; then
    return 0
  fi
  _cpv_found="$(tr -d '[:space:]' < "$_cpv_data/PG_VERSION" 2>/dev/null)"
  if [ "$_cpv_found" = "$_cpv_installed" ]; then
    return 0
  fi
  echo "FATAL: $_cpv_data was created by PostgreSQL $_cpv_found, but this image ships PostgreSQL $_cpv_installed." >&2
  echo "Major-version upgrades are a manual procedure (pg_dump from the old major, restore into the new)." >&2
  echo "See the embedded-mode upgrade docs. Refusing to start to avoid data corruption." >&2
  return 1
}
