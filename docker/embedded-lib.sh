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

# wait_for_service <label> <timeout_seconds> <expect> <probe> [args...]
# Polls <probe> once a second until it exits 0 and, when <expect> is non-empty,
# its output contains that string. Returns 0 the moment that holds. On timeout it
# prints the probe's last output and returns 1, which fails the calling s6 oneshot
# so the container reports the problem instead of waiting forever (#962). Progress
# goes to stderr every 15s so a slow boot still looks alive.
#
# The deadline is wall clock, not an attempt count, because a probe that blocks
# makes those two very different numbers. Callers still owe their probe a
# per-attempt timeout so one wedged call cannot sit inside the window.
wait_for_service() {
  _wfs_label="$1"
  _wfs_given="$2"
  _wfs_expect="$3"
  shift 3

  # An unparseable timeout would make the deadline test below error rather than
  # compare, and `if` reads that as "not expired yet": the exact unbounded loop
  # this function exists to remove. So anything that is not 1..999999 whole
  # seconds is refused outright, seven digits included, since a value that large
  # overflows the arithmetic the same way a word does. There is deliberately no
  # "unlimited" value, so 0 is refused too, even though 0 means unlimited for the
  # runtime limits in .env.example.
  case "$_wfs_given" in
    "" | *[!0-9]* | 0* | [0-9][0-9][0-9][0-9][0-9][0-9][0-9]*)
      printf 'FATAL: %s readiness timeout must be 1 to 999999 whole seconds, not "%s".\n' \
        "$_wfs_label" "$_wfs_given" >&2
      return 1
      ;;
  esac
  _wfs_timeout="$_wfs_given"
  if [ "$#" -eq 0 ]; then
    printf 'FATAL: %s readiness was asked to wait with no probe to run.\n' "$_wfs_label" >&2
    return 1
  fi

  _wfs_start="$(date +%s)"
  _wfs_deadline=$((_wfs_start + _wfs_timeout))
  _wfs_notice=$((_wfs_start + 15))
  while :; do
    if _wfs_out="$("$@" 2>&1)"; then
      case "$_wfs_out" in
        *"$_wfs_expect"*) return 0 ;;
      esac
    fi
    _wfs_now="$(date +%s)"
    if [ "$_wfs_now" -ge "$_wfs_deadline" ]; then
      # printf, not echo: the image's /bin/sh is dash, whose echo eats backslash
      # escapes, and a `\c` anywhere in a database error would truncate the line
      # this whole change exists to preserve.
      printf 'FATAL: %s did not become ready within %ss. Last probe output:\n' \
        "$_wfs_label" "$_wfs_timeout" >&2
      if [ -n "$_wfs_out" ]; then
        printf '  %s\n' "$_wfs_out" >&2
      else
        printf '  (the probe printed nothing)\n' >&2
      fi
      return 1
    fi
    if [ "$_wfs_now" -ge "$_wfs_notice" ]; then
      printf 'Waiting for %s... %ss\n' "$_wfs_label" "$((_wfs_now - _wfs_start))" >&2
      _wfs_notice=$((_wfs_now + 15))
    fi
    sleep 1
  done
}

# redis_ready / postgres_ready
# The gates the s6 tree puts between each embedded database and the app. Both are
# bounded, so a database that never answers fails the boot with a message naming
# it instead of leaving the container up with nothing serving. The defaults sit
# far above a healthy boot: Redis answers PING once it has loaded its append-only
# file, and Postgres is only polled after postgres-init finished initdb, so what
# is left there is server start plus any crash recovery.
#
# Both probes carry -t so a database that accepts the connection and then goes
# quiet cannot park inside a single attempt. redis-cli defaults to no timeout at
# all, which would swallow the deadline entirely.
redis_ready() {
  wait_for_service Redis "${EMBEDDED_REDIS_TIMEOUT_S:-180}" PONG \
    redis-cli -t 2 -h 127.0.0.1 -p 6379 ping && return 0
  printf 'Set EMBEDDED_REDIS_TIMEOUT_S (whole seconds) higher if the host is only slow.\n' >&2
  return 1
}

postgres_ready() {
  wait_for_service PostgreSQL "${EMBEDDED_POSTGRES_TIMEOUT_S:-600}" "" \
    pg_isready -t 2 -h 127.0.0.1 -p 5432 -U snapotter -d snapotter && return 0
  printf 'Set EMBEDDED_POSTGRES_TIMEOUT_S (whole seconds) higher if the host is only slow.\n' >&2
  return 1
}
