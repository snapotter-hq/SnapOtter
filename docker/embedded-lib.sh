#!/bin/sh
# Shared helpers for SnapOtter embedded mode (in-container Postgres + Redis).
# Sourced by docker/entrypoint.sh, docker/snapotter-admin,
# docker/embedded/postgres-bootstrap.sh and the s6 service scripts. Kept in its
# own file so the decision logic can be unit-tested directly
# (tests/unit/security/embedded-mode.test.ts) rather than mirrored. Sourcing
# only defines functions and a few constants, and has no other side effects.
# POSIX sh only (no bashisms).
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

# embedded_port <name> <value>
# Echoes <value> when it is a whole number from 1 to 65535, otherwise prints a
# fatal message naming <name> and returns 1. The embedded database ports are
# configurable for a container on the host network, where 5432 or 6379 may
# already be taken; the defaults stay 5432 and 6379.
embedded_port() {
  _ep_name="$1"
  _ep_value="$2"
  case "$_ep_value" in
    "" | *[!0-9]* | 0*) _ep_ok=no ;;
    *) _ep_ok=yes ;;
  esac
  if [ "$_ep_ok" = yes ] && { [ "${#_ep_value}" -gt 5 ] || [ "$_ep_value" -gt 65535 ]; }; then
    _ep_ok=no
  fi
  if [ "$_ep_ok" = no ]; then
    printf 'FATAL: %s must be a port number from 1 to 65535, not "%s".\n' \
      "$_ep_name" "$_ep_value" >&2
    return 1
  fi
  printf '%s\n' "$_ep_value"
}

# Per-install database passwords (EMBEDDED_DB_PASSWORDS=1). Without a private
# network namespace, such as with --network host, other local programs can
# reach 127.0.0.1, so the fixed passwords and trust auth that are safe behind
# Docker's network namespace are not. An install is secured once
# EMBEDDED_DB_SECRETS_DIR exists, even if the variable is later unset, and from
# then on every secret has to be valid: a missing or broken one stops whatever
# needs it instead of falling back to trust, the fixed passwords or an open
# Redis.
# shellcheck disable=SC2034 # read by the scripts that source this file
EMBEDDED_DB_SECRETS_DIR=/data/.secrets
EMBEDDED_DB_SECRET_NAMES="pg-owner pg-app redis"

# embedded_db_passwords_requested
# Echoes 1 when EMBEDDED_DB_PASSWORDS is 1, or 0 when it is unset, empty or 0.
# Any other value prints a fatal message and returns 1, so a setting such as
# `true` can't leave an install on trust auth without anyone noticing.
embedded_db_passwords_requested() {
  case "${EMBEDDED_DB_PASSWORDS:-}" in
    "" | 0) printf '0\n' ;;
    1) printf '1\n' ;;
    *)
      printf 'FATAL: EMBEDDED_DB_PASSWORDS must be 1 or 0, not "%s".\n' "$EMBEDDED_DB_PASSWORDS" >&2
      return 1
      ;;
  esac
}

# embedded_db_secured <dir>: returns 0 when <dir> exists, in any form, which
# makes the install a secured one.
embedded_db_secured() {
  [ -e "$1" ] || [ -L "$1" ]
}

# embedded_secret_ok <value>: returns 0 when <value> is exactly 64 lowercase hex
# characters, the only form a secret may take, because it is spliced into SQL
# and connection URLs unquoted.
embedded_secret_ok() {
  case "$1" in
    "" | *[!0-9a-f]*) return 1 ;;
  esac
  [ "${#1}" -eq 64 ]
}

# ensure_embedded_db_secrets <dir>: run on every boot of a secured install.
# Creates whichever secrets are missing, as 64 hex characters from /dev/urandom,
# and refuses one that is there but unusable. It also takes the directory back:
# booting with external databases hands all of /data to the app user, so the
# directory and its files go back to the account running the boot (root in the
# image), 700 and 600. g-s as well as 700: a directory made under the image's
# setgid /data inherits the bit, and GNU chmod keeps it through `chmod 700`.
ensure_embedded_db_secrets() {
  _ees_dir="$1"
  if [ -L "$_ees_dir" ]; then
    printf 'FATAL: %s has to be a directory, not a symbolic link.\n' "$_ees_dir" >&2
    return 1
  fi
  if ! mkdir -p "$_ees_dir" || ! chown -R "$(id -u):$(id -g)" "$_ees_dir" ||
    ! chmod 700 "$_ees_dir" || ! chmod g-s "$_ees_dir"; then
    printf 'FATAL: could not create %s for the embedded database passwords.\n' "$_ees_dir" >&2
    return 1
  fi
  for _ees_name in $EMBEDDED_DB_SECRET_NAMES; do
    _ees_file="$_ees_dir/$_ees_name"
    if [ -e "$_ees_file" ] || [ -L "$_ees_file" ]; then
      (read_embedded_secret "$_ees_dir" "$_ees_name" > /dev/null) || return 1
      chmod 600 "$_ees_file" || return 1
      continue
    fi
    # Removed first, so a leftover file or link by that name can't redirect the
    # write, and checked before the rename, so a failed read of /dev/urandom
    # can't leave an empty secret behind.
    _ees_tmp="$_ees_dir/.$_ees_name.tmp"
    rm -f "$_ees_tmp"
    if ! (umask 077 && od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$_ees_tmp") ||
      ! embedded_secret_ok "$(cat "$_ees_tmp" 2>/dev/null)" ||
      ! mv "$_ees_tmp" "$_ees_file"; then
      rm -f "$_ees_tmp"
      printf 'FATAL: could not write the embedded %s password in %s.\n' "$_ees_name" "$_ees_dir" >&2
      return 1
    fi
  done
  return 0
}

# read_embedded_secret <dir> <name>: echoes the secret, which has to be a
# regular file of exactly 64 lowercase hex characters. Anything else is refused,
# and the message says how to recover: every boot generates the secrets that
# are missing and applies them all again.
read_embedded_secret() {
  _res_file="$1/$2"
  if [ ! -e "$_res_file" ] && [ ! -L "$_res_file" ]; then
    printf 'FATAL: %s is missing. Restart the container: every boot generates missing passwords and applies them.\n' \
      "$_res_file" >&2
    return 1
  fi
  _res_value=""
  if [ -f "$_res_file" ] && [ ! -L "$_res_file" ]; then
    _res_value="$(cat "$_res_file" 2>/dev/null)" || _res_value=""
  fi
  if ! embedded_secret_ok "$_res_value"; then
    printf 'FATAL: %s is not a valid embedded database password (a file of 64 lowercase hex characters). It is safe to delete it and restart the container: every boot generates missing passwords and applies them.\n' \
      "$_res_file" >&2
    return 1
  fi
  printf '%s\n' "$_res_value"
}

# write_embedded_pg_hba <pgdata>: replaces pg_hba.conf with the secured rules.
# Local socket connections stay trusted, because the socket is only reachable
# from inside the container. TCP takes the two app roles with scram-sha-256 and
# nothing else. On a data dir created by 2.3.0 or later the superuser is
# `postgres`, which has no password, so it cannot log in over TCP at all. On an
# older one `snapotter` is the bootstrap superuser, and its per-install password
# is what guards that login.
write_embedded_pg_hba() {
  _wph_tmp="$1/pg_hba.conf.tmp"
  # Removed first, so a leftover file or link by that name can't redirect the write.
  rm -f "$_wph_tmp"
  if ! printf '%s\n' \
    "# Managed by SnapOtter (EMBEDDED_DB_PASSWORDS). Rewritten on every boot." \
    "local all all trust" \
    "host snapotter snapotter,snapotter_app 127.0.0.1/32 scram-sha-256" \
    > "$_wph_tmp" || ! mv "$_wph_tmp" "$1/pg_hba.conf"; then
    rm -f "$_wph_tmp"
    printf 'FATAL: could not write %s/pg_hba.conf.\n' "$1" >&2
    return 1
  fi
}

# write_embedded_redis_conf <file> <secrets_dir>: the config file redis-server
# reads first. A secured install gets requirepass here, not on the command line,
# because /proc/<pid>/cmdline is readable by every local user. s6 runs this
# again whenever Redis restarts, long after the boot checked the secrets, so a
# secret that has gone missing since then stops Redis instead of opening it.
write_embedded_redis_conf() {
  if [ -z "$2" ]; then
    printf 'FATAL: write_embedded_redis_conf needs the secrets directory.\n' >&2
    return 1
  fi
  if embedded_db_secured "$2"; then
    _wrc_pw="$(read_embedded_secret "$2" redis)" || return 1
    (umask 077 && printf 'requirepass %s\n' "$_wrc_pw" > "$1") || return 1
  else
    (umask 077 && printf '' > "$1") || return 1
  fi
}

# export_embedded_db_env <secrets_dir>
# Validates EMBEDDED_PG_PORT and EMBEDDED_REDIS_PORT (unset or empty means 5432
# and 6379) and exports them, with the URLs the app reaches the embedded
# databases through. A secured install (<secrets_dir> exists) gets its
# per-install passwords and fails without all three. The entrypoint calls it
# before s6 starts. snapotter-admin calls it too, because a `docker exec` shell
# never sees the entrypoint's exports. Nothing is set until everything has
# passed, so a refusal leaves the caller's variables as they were.
export_embedded_db_env() {
  if [ -z "$1" ]; then
    printf 'FATAL: export_embedded_db_env needs the secrets directory.\n' >&2
    return 1
  fi
  _eede_pg_port="$(embedded_port EMBEDDED_PG_PORT "${EMBEDDED_PG_PORT:-5432}")" || return 1
  _eede_redis_port="$(embedded_port EMBEDDED_REDIS_PORT "${EMBEDDED_REDIS_PORT:-6379}")" || return 1
  # Otherwise Redis takes the port first and Postgres retries the bind until its
  # readiness timeout runs out, ten minutes by default, before the boot fails.
  if [ "$_eede_pg_port" = "$_eede_redis_port" ]; then
    printf 'FATAL: EMBEDDED_PG_PORT and EMBEDDED_REDIS_PORT are both %s; they need different ports.\n' \
      "$_eede_pg_port" >&2
    return 1
  fi
  if embedded_db_secured "$1"; then
    _eede_owner="$(read_embedded_secret "$1" pg-owner)" || return 1
    _eede_app="$(read_embedded_secret "$1" pg-app)" || return 1
    _eede_redis="$(read_embedded_secret "$1" redis)" || return 1
  else
    # The fixed passwords the bootstrap gives both roles, which trust auth never
    # checks, and no Redis password.
    _eede_owner=snapotter
    _eede_app=snapotter_app
    _eede_redis=""
  fi
  export EMBEDDED_PG_PORT="$_eede_pg_port" EMBEDDED_REDIS_PORT="$_eede_redis_port"
  # Same split as the Compose stack: requests are served by the DML-only
  # snapotter_app role, and only the short-lived boot connection uses the
  # database owner. Both roles are created by the first-boot bootstrap; on a
  # data dir from before the split the app creates snapotter_app itself at boot.
  export DATABASE_URL="postgres://snapotter_app:${_eede_app}@127.0.0.1:${EMBEDDED_PG_PORT}/snapotter"
  export DATABASE_MIGRATION_URL="postgres://snapotter:${_eede_owner}@127.0.0.1:${EMBEDDED_PG_PORT}/snapotter"
  if [ -n "$_eede_redis" ]; then
    export REDIS_URL="redis://:${_eede_redis}@127.0.0.1:${EMBEDDED_REDIS_PORT}"
    # redis-cli reads REDISCLI_AUTH, so the readiness probe authenticates
    # without -a, which would put the password on its command line.
    export REDISCLI_AUTH="$_eede_redis"
  else
    export REDIS_URL="redis://127.0.0.1:${EMBEDDED_REDIS_PORT}"
  fi
  unset _eede_pg_port _eede_redis_port _eede_owner _eede_app _eede_redis
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
    redis-cli -t 2 -h 127.0.0.1 -p "${EMBEDDED_REDIS_PORT:-6379}" ping && return 0
  printf 'Set EMBEDDED_REDIS_TIMEOUT_S (whole seconds) higher if the host is only slow.\n' >&2
  return 1
}

postgres_ready() {
  wait_for_service PostgreSQL "${EMBEDDED_POSTGRES_TIMEOUT_S:-600}" "" \
    pg_isready -t 2 -h 127.0.0.1 -p "${EMBEDDED_PG_PORT:-5432}" -U snapotter -d snapotter && return 0
  printf 'Set EMBEDDED_POSTGRES_TIMEOUT_S (whole seconds) higher if the host is only slow.\n' >&2
  return 1
}

# mark_snapotter_ready <api_pid>
# Polls the local /api/v1/health endpoint while <api_pid> stays alive and writes
# SNAPOTTER_READY_FILE (/run/s6/snapotter-ready by default) as soon as the API
# answers HTTP 200 with `"status":"healthy"`. /run/s6 is wiped by s6-overlay
# preinit on every container boot, so the file's presence tells snapotter_finish
# that this container's API completed its initial startup at least once (#2267).
mark_snapotter_ready() {
  _msr_pid="$1"
  _msr_file="${SNAPOTTER_READY_FILE:-/run/s6/snapotter-ready}"
  if [ -f "$_msr_file" ]; then
    return 0
  fi
  if [ -z "$_msr_pid" ]; then
    return 1
  fi
  while kill -0 "$_msr_pid" 2>/dev/null; do
    if _msr_out="$(curl --noproxy '*' -sf --max-time 2 \
      "http://127.0.0.1:${PORT:-1349}/api/v1/health" 2>/dev/null)"; then
      case "$_msr_out" in
        *'"status":"healthy"'*)
          # printf, not `:`: in dash (the image's /bin/sh), `:` is a POSIX
          # special built-in whose redirection failure aborts the whole shell
          # with status 2 before `if !` can run the warning branch.
          if ! printf '' > "$_msr_file" 2>/dev/null; then
            printf 'WARNING: mark_snapotter_ready could not write %s\n' "$_msr_file" >&2
            return 1
          fi
          return 0
          ;;
      esac
    fi
    sleep 1
  done
  return 1
}

# snapotter_finish <exit_code> [signal]
# Called by s6-supervise when the snapotter longrun process exits. s6 passes the
# exit status as $1 (0..255), or 256 when the process was killed by a signal
# (with the signal number in $2).
#
# When the API exits non-zero (1..255) before its first boot has reached healthy
# (for example a loadEnv() validation error on BASE_PATH or a rejected
# DEFAULT_PASSWORD in ensureDefaultAdmin), record the exit code for
# s6-linux-init, ask s6 to halt the container, and return 125 so s6-supervise
# does not respawn the service while the shutdown tree runs (#2267). Signal
# terminations ($1 = 256, such as SIGTERM from `docker stop` while still booting
# or an OOM SIGKILL) and any crash after mark_snapotter_ready has recorded a
# healthy boot return 0 so s6 supervises them normally.
snapotter_finish() {
  _sf_code="${1:-0}"
  _sf_ready="${SNAPOTTER_READY_FILE:-/run/s6/snapotter-ready}"
  _sf_exitfile="${S6_EXITCODE_FILE:-/run/s6-linux-init-container-results/exitcode}"
  _sf_halt="${S6_HALT_BIN:-/run/s6/basedir/bin/halt}"

  if [ -f "$_sf_ready" ]; then
    return 0
  fi

  case "$_sf_code" in
    "" | *[!0-9]*)
      return 0
      ;;
  esac

  if [ "$_sf_code" -le 0 ] || [ "$_sf_code" -ge 256 ]; then
    return 0
  fi

  if ! printf '%s\n' "$_sf_code" > "$_sf_exitfile"; then
    printf 'FATAL: snapotter_finish could not write exit code %s to %s.\n' \
      "$_sf_code" "$_sf_exitfile" >&2
  fi
  if ! "$_sf_halt"; then
    printf 'FATAL: snapotter_finish failed to halt container via %s (API exit code %s).\n' \
      "$_sf_halt" "$_sf_code" >&2
    return 1
  fi
  return 125
}
