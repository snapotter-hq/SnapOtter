# Upgrading from 1.x to 2.0

SnapOtter 1.x stored everything in a single SQLite file and ran as one container. SnapOtter 2.0 uses PostgreSQL and Redis. This guide walks through moving a 1.x install to 2.0 without losing data.

The short version: reuse your existing `/data` volume, and 2.0 imports your 1.x database automatically on first boot. Your users, saved files, settings, API keys, and pipelines come across. The old database is never modified, so you can always roll back.

::: tip A note for our 1.x users
Many of you have trusted SnapOtter since day one, and your feedback shaped this release. 2.0 changes a lot under the hood, and this guide exists so the move doesn't cost you anything you care about. Your accounts, files, settings, API keys, and pipelines carry over, and your old database is never touched. Thank you for upgrading with us.
:::

## Before you start: back up the whole `/data` volume

Do this first, every time. Back up the **entire** `/data` volume, not just the `snapotter.db` file.

Here is why it matters. 1.x runs SQLite in WAL mode, so a stopped 1.x container routinely leaves most of its committed data in `snapotter.db-wal` beside an almost-empty `snapotter.db`. Copying only `snapotter.db` captures an empty database and silently loses everything. The volume carries `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, and your `files/` directory together, and they must travel as a set.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Upgrade to 1.17.2 first

Upgrade your 1.x install to the latest 1.x release (1.17.2) before moving to 2.0. That lets 1.x run its own final schema migrations, so 2.0 imports from a known, complete schema. Upgrading from an older 1.x straight to 2.0 is not supported.

## Check your volume name

The importer only sees your data if the 2.0 stack mounts the same volume your 1.x install used. Docker volume names are case sensitive, and older README snippets used a lowercase `snapotter-data` while the Compose files use `SnapOtter-data`. Confirm which one you have:

```bash
docker volume ls | grep -i snapotter
```

Use that exact name in your 2.0 configuration.

## Path A: single container (quickest)

If you run SnapOtter with a single `docker run`, keep doing that. 2.0 boots an embedded PostgreSQL and Redis inside the container when you do not set `DATABASE_URL` or `REDIS_URL`, and it auto-detects and imports `/data/snapotter.db` on first boot.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Watch the logs for a line like:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

That is it. Log in with your existing credentials.

## Path B: Compose (recommended for production)

The 2.0 Compose stack runs three services (app, Postgres, Redis). Reuse your 1.x `/data` volume for the app service. The app auto-detects `/data/snapotter.db` and imports it into Postgres on first boot.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

If you would rather point at the old database explicitly, set `SQLITE_MIGRATE_PATH=/data/snapotter.db`. An explicit path always wins over auto-detect.

## Preview the import first (optional)

To see exactly what would be imported without writing anything, run a dry run against your database file:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

It prints the row counts per table, how many saved-library files it found on disk, and any job statuses it will normalize. It needs no running Postgres.

## What carries over, and what does not

Carried over:

- Users, and the ability to log in. Password hashes are unchanged, so the same username and password work.
- Teams, settings (including your instance identity), roles, API keys (they keep working), and saved pipelines.
- Job history records.
- Your saved-file library, both the records and the actual files, because `/data/files` is preserved on the volume.

Not carried over:

- Login sessions. Everyone signs in once after the upgrade. Credentials are unchanged, so it is a single re-login, nothing more.
- The input and output files of old processing jobs. Those lived in a temporary workspace and are gone by design. The job history records remain.
- Per-user analytics-consent flags from 1.x, which have no 2.0 equivalent (2.0 analytics is an instance-level setting).

## Turning the import off

If you deliberately want a fresh database even though a `snapotter.db` is present on the volume, set `SQLITE_MIGRATE_PATH=off`.

## If you already have data in the 2.0 instance

The importer only runs into an empty database. If you started 2.0 fresh (creating data), then later mounted an old `snapotter.db`, 2.0 will detect it but will not import, because merging two datasets can collide on IDs. You will see a warning in the logs. To import the 1.x data you need an empty instance:

- If the 2.0 instance only holds the default admin (you have not really used it), stop the stack, remove the Postgres volume (`SnapOtter-pgdata`), and boot again with the old `/data` present. It will import cleanly. This wipes only the throwaway Postgres data, not your 1.x database.
- If the 2.0 instance holds real data you want to keep, the two datasets cannot be auto-merged. Export what you need and import the 1.x data into a separate fresh deployment.

## Rolling back

The upgrade never modifies or deletes your 1.x `snapotter.db`. If you need to go back to 1.x, redeploy the 1.x image against the same volume. Anything you created in 2.0 after the upgrade lives in Postgres and would not be in the 1.x database, so roll back promptly if you are going to.
