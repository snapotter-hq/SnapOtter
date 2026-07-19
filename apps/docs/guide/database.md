---
description: PostgreSQL database schema, tables, migrations, and backup procedures for SnapOtter.
---

# Database {#database}

SnapOtter uses PostgreSQL 17 with [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) for data persistence. The schema is defined in `apps/api/src/db/schema.ts`.

The connection is configured via the `DATABASE_URL` environment variable (default `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose, the Postgres container stores its data in the `SnapOtter-pgdata` named volume.

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

## Migrations {#migrations}

Drizzle handles schema migrations. Migration files live in `apps/api/drizzle/`. During development:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In production, pending migrations are applied automatically on startup.

## Backup and restore {#backup-and-restore}

The relational database lives in the Postgres container's `SnapOtter-pgdata` volume, not the app's `/data` volume.

**Option 1: pg_dump (recommended)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Option 2: Volume snapshot**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migrating from 1.x (SQLite) {#migrating-from-1-x-sqlite}

Upgrading from SnapOtter 1.x has its own guide: see [Upgrading from 1.x to 2.0](./upgrading). In short, reuse your existing `/data` volume and 2.0 auto-detects and imports `/data/snapotter.db` on first boot (or set `SQLITE_MIGRATE_PATH` to point at it explicitly). Back up the whole `/data` volume first, not just `snapotter.db`: 1.x uses SQLite WAL mode, so a stopped container often leaves most of its data in `snapotter.db-wal` beside an almost-empty `snapotter.db`.
