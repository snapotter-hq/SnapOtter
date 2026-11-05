#!/bin/sh
# Boot-time initializer for the embedded Postgres. Runs as ROOT inside the s6
# `postgres-init` oneshot, before the `postgres` longrun starts. Idempotent: on a
# data dir that already exists it guards the version, reapplies the per-install
# passwords on secured installs, and fixes ownership.
set -e
. /usr/local/bin/embedded-lib.sh

PGDATA=/data/postgres
PGBIN=/usr/lib/postgresql/17/bin
INSTALLED_MAJOR=17
TMP=/data/postgres.bootstrapping   # same filesystem as PGDATA so the mv is atomic
SECRETS=/data/.secrets

# Clean any interrupted previous bootstrap.
rm -rf "$TMP"

if [ -f "$PGDATA/PG_VERSION" ]; then
  check_pg_version "$PGDATA" "$INSTALLED_MAJOR" || exit 1
  echo "Embedded Postgres: existing data dir OK (major $INSTALLED_MAJOR)."
else
  echo "Embedded Postgres: first-boot initdb..."
  install -d -o postgres -g postgres -m 700 "$TMP"

  # initdb: C locale (byte-ordered, libc-independent collation, so the data dir is
  # safe across the glibc/musl handoff to a Compose postgres:17-alpine), trust auth
  # on loopback (the only reachable interface). Secured installs replace the
  # pg_hba.conf this writes, below.
  #
  # Three roles, and the app is none of the privileged ones. `postgres` is the
  # bootstrap superuser and appears in no connection string SnapOtter uses.
  # `snapotter` owns the database and runs migrations on a short-lived boot
  # connection. `snapotter_app` serves every request and may only read and write
  # rows. So even the boot-time migration connection cannot reach
  # COPY ... FROM PROGRAM, and a SQL injection against the running app lands on a
  # role that has no path to the shell.
  s6-setuidgid postgres "$PGBIN/initdb" -D "$TMP" \
    --username=postgres --encoding=UTF8 --locale=C \
    --auth-local=trust --auth-host=trust

  # Loopback only, and avoid the 64MB /dev/shm for parallel workers.
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "dynamic_shared_memory_type = mmap"
  } >> "$TMP/postgresql.conf"

  # Create the two app roles and the database via single-user mode: no socket, no
  # listener, no /var/run/postgresql, auth bypassed. Each invocation below is its
  # own session, so the roles are created first: CREATE DATABASE ... OWNER has to
  # resolve the owner name, and a role from a later session would be too late.
  # Passwords match what the entrypoint exports for unsecured installs; secured
  # installs overwrite them below.
  echo "CREATE ROLE snapotter LOGIN PASSWORD 'snapotter' NOSUPERUSER NOCREATEROLE NOCREATEDB;" | \
    s6-setuidgid postgres "$PGBIN/postgres" --single -D "$TMP" postgres
  echo "CREATE ROLE snapotter_app LOGIN PASSWORD 'snapotter_app' NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;" | \
    s6-setuidgid postgres "$PGBIN/postgres" --single -D "$TMP" postgres
  echo "CREATE DATABASE snapotter OWNER snapotter;" | \
    s6-setuidgid postgres "$PGBIN/postgres" --single -D "$TMP" postgres

  # Atomic publish: a crash before this leaves only the throwaway temp dir.
  mv "$TMP" "$PGDATA"
  echo "Embedded Postgres: initialized."
fi

# Secured installs (EMBEDDED_DB_PASSWORDS): TCP needs the per-install passwords.
# They are set on every boot, so a data dir first created unsecured, or a
# replaced secret file, converges. Single-user mode, so nothing is listening yet.
# log_min_error_statement=panic keeps a failed statement, password included, out
# of the log. A missing snapotter_app (a data dir from before the role split) only
# errors here; the app creates it at boot with the DATABASE_URL password.
if embedded_db_secured "$SECRETS"; then
  OWNER_PW="$(read_embedded_secret "$SECRETS" pg-owner)"
  APP_PW="$(read_embedded_secret "$SECRETS" pg-app)"
  write_embedded_pg_hba "$PGDATA"
  printf "ALTER ROLE snapotter PASSWORD '%s';\n" "$OWNER_PW" | \
    s6-setuidgid postgres "$PGBIN/postgres" --single -D "$PGDATA" \
      -c log_min_error_statement=panic postgres > /dev/null
  printf "ALTER ROLE snapotter_app PASSWORD '%s';\n" "$APP_PW" | \
    s6-setuidgid postgres "$PGBIN/postgres" --single -D "$PGDATA" \
      -c log_min_error_statement=panic postgres > /dev/null
  unset OWNER_PW APP_PW
  echo "Embedded Postgres: per-install passwords applied."
fi

chown -R postgres:postgres "$PGDATA"
