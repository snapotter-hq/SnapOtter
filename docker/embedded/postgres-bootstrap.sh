#!/bin/sh
# First-boot initializer for the embedded Postgres. Runs as ROOT inside the s6
# `postgres-init` oneshot, before the `postgres` longrun starts. Idempotent: on a
# data dir that already exists it only guards the version and fixes ownership.
set -e
. /usr/local/bin/embedded-lib.sh

PGDATA=/data/postgres
PGBIN=/usr/lib/postgresql/17/bin
INSTALLED_MAJOR=17
TMP=/data/postgres.bootstrapping   # same filesystem as PGDATA so the mv is atomic

# Clean any interrupted previous bootstrap.
rm -rf "$TMP"

# Existing data dir: guard the major version, fix ownership, done.
if [ -f "$PGDATA/PG_VERSION" ]; then
  check_pg_version "$PGDATA" "$INSTALLED_MAJOR" || exit 1
  chown -R postgres:postgres "$PGDATA"
  echo "Embedded Postgres: existing data dir OK (major $INSTALLED_MAJOR)."
  exit 0
fi

echo "Embedded Postgres: first-boot initdb..."
install -d -o postgres -g postgres -m 700 "$TMP"

# initdb: C locale (byte-ordered, libc-independent collation, so the data dir is
# safe across the glibc/musl handoff to a Compose postgres:17-alpine), trust auth
# on loopback (the only reachable interface), bootstrap superuser `snapotter` so
# the role in DATABASE_URL already exists.
s6-setuidgid postgres "$PGBIN/initdb" -D "$TMP" \
  --username=snapotter --encoding=UTF8 --locale=C \
  --auth-local=trust --auth-host=trust

# Loopback only, and avoid the 64MB /dev/shm for parallel workers.
{
  echo "listen_addresses = '127.0.0.1'"
  echo "dynamic_shared_memory_type = mmap"
} >> "$TMP/postgresql.conf"

# Create the application database and set the role password via single-user mode:
# no socket, no listener, no /var/run/postgresql, auth bypassed. The snapotter
# superuser already exists from initdb --username. The password is harmless under
# trust auth but lets a future scram flip work without a reinit.
echo "CREATE DATABASE snapotter OWNER snapotter;" | \
  s6-setuidgid postgres "$PGBIN/postgres" --single -D "$TMP" postgres
echo "ALTER ROLE snapotter WITH PASSWORD 'snapotter';" | \
  s6-setuidgid postgres "$PGBIN/postgres" --single -D "$TMP" postgres

# Atomic publish: a crash before this leaves only the throwaway temp dir.
mv "$TMP" "$PGDATA"
echo "Embedded Postgres: initialized."
