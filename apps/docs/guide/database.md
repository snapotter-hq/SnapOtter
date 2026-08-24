---
description: PostgreSQL database schema, tables, migrations, and backup procedures for SnapOtter.
---

# Database {#database}

SnapOtter uses PostgreSQL 17 with [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) for data persistence. The schema is defined in `apps/api/src/db/schema.ts`.

The connection is configured via the `DATABASE_URL` environment variable (default `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose, the Postgres container stores its data in the `SnapOtter-pgdata` named volume. Requests are served on a role that can only read and write rows, which is covered under [Least-privilege roles](#least-privilege-roles) below.

## Tables {#tables}

### users {#users}

Stores user accounts. Created automatically on first run from `DEFAULT_USERNAME` and `DEFAULT_PASSWORD`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `username` | varchar | Unique, required |
| `passwordHash` | varchar | scrypt hash |
| `role` | varchar | `admin`, `editor`, or `user` |
| `mustChangePassword` | boolean | Forced password reset flag |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

### sessions {#sessions}

Active login sessions. Each row ties a session token to a user.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar | Primary key (session token) |
| `userId` | uuid | Foreign key to `users.id` |
| `expiresAt` | timestamp | Expiry time |
| `createdAt` | timestamp | Creation time |

### teams {#teams}

Groups for organizing users. Admins can assign users to teams.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | varchar (unique, max 50 chars) | Team name |
| `createdAt` | timestamp | Creation time |

### api_keys {#api-keys}

API keys for programmatic access. The raw key is shown once on creation; only the hash is stored.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `userId` | uuid | Foreign key to `users.id` |
| `keyHash` | varchar | scrypt hash of the key |
| `name` | varchar | User-provided label |
| `createdAt` | timestamp | Creation time |
| `lastUsedAt` | timestamp | Updated on each authenticated request |

Keys are prefixed with `si_` followed by 96 hex characters (48 random bytes).

### pipelines {#pipelines}

Saved tool chains that users create in the UI.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | varchar | Pipeline name |
| `description` | varchar | Optional description |
| `steps` | jsonb | Array of `{ toolId, settings }` objects |
| `createdAt` | timestamp | Creation time |

### user_files {#user-files}

Persistent file library. A saved edit is inserted as an independent root row by default ("save as new": `version` 1, `parentId` null, so the original stays listed), or as a parent-linked version when you overwrite the original (`parentId` set, `version` incremented, superseding it). The `toolChain` column records the tools applied.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `userId` | uuid | FK to users (CASCADE DELETE) |
| `originalName` | varchar | Original upload filename |
| `storedName` | varchar | Filename on disk |
| `mimeType` | varchar | MIME type |
| `size` | integer | File size in bytes |
| `width` | integer | Image width in px |
| `height` | integer | Image height in px |
| `version` | integer | Version number (1 = original) |
| `parentId` | uuid or null | FK to user_files (parent version) |
| `toolChain` | jsonb | Tool IDs applied in order to produce this version |
| `createdAt` | timestamp | Creation time |

### jobs {#jobs}

Tracks processing jobs for progress reporting and cleanup.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `type` | varchar | Tool or pipeline identifier |
| `status` | varchar | `queued`, `processing`, `completed`, or `failed` |
| `progress` | real | 0.0-1.0 fraction |
| `inputFiles` | jsonb | Array of input file paths |
| `outputPath` | varchar | Path to the result file |
| `settings` | jsonb | Tool settings used |
| `error` | varchar | Error message if failed |
| `createdAt` | timestamp | Creation time |
| `completedAt` | timestamp | Completion time |

### settings {#settings}

Key-value store for server-wide settings that admins can change from the UI.

| Column | Type | Notes |
|---|---|---|
| `key` | varchar | Primary key |
| `value` | varchar | Setting value |
| `updatedAt` | timestamp | Last update time |

### roles {#roles}

Custom roles with granular permissions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | varchar | Unique role name |
| `description` | varchar | Optional description |
| `permissions` | jsonb | Array of permission strings |
| `createdAt` | timestamp | Creation time |

### audit_log {#audit-log}

Security-relevant action log.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `userId` | uuid | FK to users |
| `action` | varchar | Action type |
| `details` | jsonb | Action-specific data |
| `createdAt` | timestamp | Action time |

### user_preferences {#user-preferences}

Per-user UI state, keyed by preference name. Backs the dashboard's pinned tools through `PUT /api/v1/preferences`.

| Column | Type | Notes |
|---|---|---|
| `userId` | text | FK to users, cascades on delete. Primary key with `key` |
| `key` | text | Preference name. Primary key with `userId` |
| `value` | jsonb | Preference payload |
| `updatedAt` | timestamp | Last write |

## Migrations {#migrations}

Drizzle handles schema migrations. Migration files live in `apps/api/drizzle/`. During development:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In production, pending migrations are applied automatically on startup.

## Least-privilege roles {#least-privilege-roles}

Two roles, two jobs. `DATABASE_URL` serves requests and holds `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the app's tables plus `USAGE` and `SELECT` on their sequences. That is the entire list. It cannot create or drop a table, install an extension, `TRUNCATE`, read `pg_authid`, create a database, alter a role, or touch the `drizzle` schema where migration history lives.

`DATABASE_MIGRATION_URL` is the privileged one. It runs migrations and grants the runtime role during boot, then closes before a single request is served.

Compose and the all-in-one image are wired this way already, existing installs included. On boot SnapOtter creates the runtime role if it is missing, grants it, migrates, then sweeps the grants onto tables that were there before. Upgrading needs no manual SQL.

Leaving `DATABASE_MIGRATION_URL` empty runs single-role, with `DATABASE_URL` doing both jobs exactly as it did before the split. That is a supported configuration, not a deprecated one. It is the right answer on managed Postgres, where creating roles is often not yours to do.

### External and managed Postgres {#external-and-managed-postgres}

On RDS, Supabase, Cloud SQL, or any cluster you run yourself, the split is opt-in. Create the runtime role once:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Then hand SnapOtter both connection strings, pointed at the same host, port, and database:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Stop there. SnapOtter applies the grants itself and reapplies them after every migration, so a table added by a future release is covered without anyone running SQL for it.

The role in `DATABASE_MIGRATION_URL` has to own the SnapOtter tables, because only a table's owner can grant on it. On an existing install that means the role you have been running SnapOtter as, not a fresh one created for the purpose. Point it at a new role that owns nothing and boot fails with an error saying exactly this. It also needs `CREATEROLE` to create and maintain the runtime role, and the right to create the `drizzle` schema.

Name the same role in both URLs and the split is off, and SnapOtter says so in the log instead of pretending otherwise. If your provider gives you no role that can both own the tables and hold `CREATEROLE`, run single-role.

### Why the superuser bit is left alone {#why-the-superuser-bit-is-left-alone}

SnapOtter never strips `SUPERUSER` from a role by itself. On an install created before the split, `snapotter` is the cluster's only superuser, and demoting it would leave the cluster with none, recoverable only through single-user mode with the server stopped. Moving the long-lived connection to the restricted role is what buys the protection instead. The superuser is on the wire for the few seconds of boot and then gone.

Fresh all-in-one installs never have that problem. They get three roles: `postgres` (bootstrap superuser, absent from every connection string SnapOtter uses), `snapotter` (`NOSUPERUSER`, owns the data, connects only at boot), and `snapotter_app` (rows only, serves requests).

To demote an older `snapotter` anyway, create a second superuser first and log in as it to confirm it works. Then `ALTER ROLE snapotter NOSUPERUSER`.

## Backup and restore {#backup-and-restore}

The relational database lives in the Postgres container's `SnapOtter-pgdata` volume, not the app's `/data` volume.

**Logical backup with validation (recommended)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Both commands connect as `snapotter`, the owner, and should keep doing so. The runtime role can't see the `drizzle` schema, so a dump taken as that role would come out incomplete. `--no-owner` leaves restored objects owned by whoever runs the restore, so running it as the owner puts ownership where the grants expect it. One catch on a fresh cluster: `pg_dump` carries the grants but not the roles they name, so create `snapotter_app` before restoring or `--exit-on-error` stops on the first `GRANT`. SnapOtter reapplies the grants on its next boot regardless.

This database dump does not contain saved library objects in `/data/files` or durable BullMQ state in Redis. Back up and restore those with the coordinated procedure in [Security & Hardening](/guide/security#backup-and-recovery).

**Cold volume snapshot**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Do not copy a live PostgreSQL data directory with `tar`. Compose prefixes volume names by project, so resolve the mounted volume IDs from `docker inspect` or your storage platform rather than assuming the literal label `SnapOtter-pgdata`.

### Migrating from 1.x (SQLite) {#migrating-from-1-x-sqlite}

Upgrading from SnapOtter 1.x has its own guide: see [Upgrading from 1.x to 2.0](./upgrading). In short, reuse your existing `/data` volume and 2.0 auto-detects and imports `/data/snapotter.db` on first boot (or set `SQLITE_MIGRATE_PATH` to point at it explicitly). Back up the whole `/data` volume first, not just `snapotter.db`: 1.x uses SQLite WAL mode, so a stopped container often leaves most of its data in `snapotter.db-wal` beside an almost-empty `snapotter.db`.
