---
description: PostgreSQL database schema, tables, migrations, and backup procedures for SnapOtter.
---

# Database

SnapOtter uses PostgreSQL 17 with [Drizzle ORM](https://orm.drizzle.team/) (pg-core) for data persistence. The schema is defined in `apps/api/src/db/schema.ts`.

The database connection is configured via `DATABASE_URL` (defaults to `postgres://snapotter:snapotter@localhost:5432/snapotter`). In Docker Compose, Postgres runs as a separate container with its own volume.

## Tables

SnapOtter defines a custom `job_status` enum with values: `queued`, `processing`, `completed`, `failed`, `canceled`.

### users

Stores user accounts. The initial admin is created on first run from `DEFAULT_USERNAME` and `DEFAULT_PASSWORD`.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `username` | text | Unique, not null |
| `password_hash` | text | scrypt hash (nullable for OIDC-only users) |
| `role` | text | Not null, default `'user'` |
| `team` | text | Not null, default `'Default'` |
| `must_change_password` | boolean | Not null, default `true` |
| `auth_provider` | text | Not null, default `'local'` (`local`, `oidc`) |
| `external_id` | text | OIDC subject identifier |
| `email` | text | Optional email address |
| `legal_hold` | boolean | Not null, default `false` |
| `storage_used` | bigint | Not null, default `0` (bytes) |
| `storage_quota` | bigint | Per-user storage cap in bytes (null = unlimited) |
| `created_at` | timestamptz | Not null |
| `updated_at` | timestamptz | Not null |
| `totp_secret` | text | TOTP secret for MFA |
| `totp_enabled` | boolean | Not null, default `false` |
| `recovery_codes_hash` | text | Hashed MFA recovery codes |
| `analytics_enabled` | boolean | User's analytics opt-in preference |
| `analytics_consent_shown_at` | timestamptz | When the consent prompt was last shown |
| `analytics_consent_remind_at` | timestamptz | When to show the consent prompt again |

### teams

Groups for organizing users. Admins can assign users to teams.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `name` | text | Unique, not null |
| `legal_hold` | boolean | Not null, default `false` |
| `storage_quota` | bigint | Team-wide storage cap in bytes (null = unlimited) |
| `retention_hours` | integer | Auto-delete files after this many hours (null = forever) |
| `created_at` | timestamptz | Not null |

### sessions

Active login sessions. Each row ties a session token to a user.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (session token) |
| `user_id` | text | FK -> `users.id` (CASCADE) |
| `expires_at` | timestamptz | Not null |
| `id_token` | text | OIDC ID token (for logout) |
| `last_activity` | timestamptz | Updated on each authenticated request |
| `created_at` | timestamptz | Not null |

### settings

Key-value store for server-wide settings that admins change from the UI.

| Column | Type | Notes |
|---|---|---|
| `key` | text | Primary key |
| `value` | text | Not null |
| `updated_at` | timestamptz | Not null |

### jobs

Tracks BullMQ processing jobs for progress reporting and cleanup. Indexed on `created_at` and `status`.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (UUID) |
| `user_id` | text | FK -> `users.id` (SET NULL) |
| `tool_id` | text | Tool identifier |
| `pool` | text | BullMQ pool (`image`, `media`, `ai`, `docs`, `system`) |
| `type` | text | Not null, job type identifier |
| `status` | job_status | Enum, not null, default `'queued'` |
| `attempts` | integer | Not null, default `0` |
| `progress` | jsonb | `{ percent, stage? }` |
| `input_refs` | jsonb | Array of input object-storage paths |
| `output_refs` | jsonb | Array of output object-storage paths |
| `settings` | jsonb | Tool settings used for this job |
| `error` | jsonb | `{ message, details? }` on failure |
| `bytes_in` | bigint | Input size in bytes |
| `bytes_out` | bigint | Output size in bytes |
| `duration_ms` | integer | Processing time in milliseconds |
| `created_at` | timestamptz | Not null |
| `started_at` | timestamptz | When the worker picked up the job |
| `completed_at` | timestamptz | When the job finished |
| `delete_after` | timestamptz | Auto-cleanup timestamp |

### api_keys

API keys for programmatic access. The raw key is shown once on creation; only the hash is stored. Keys are prefixed with `si_` followed by 96 hex characters (48 random bytes).

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `user_id` | text | FK -> `users.id` (CASCADE) |
| `key_hash` | text | Not null, scrypt hash of the key |
| `key_prefix` | text | First characters of the key for identification |
| `name` | text | Not null, default `'Default API Key'` |
| `permissions` | jsonb | Scoped permission array (null = inherit all from user role) |
| `created_at` | timestamptz | Not null |
| `last_used_at` | timestamptz | Updated on each authenticated request |
| `expires_at` | timestamptz | Optional expiration |

### pipelines

Saved tool chains that users create in the UI.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `user_id` | text | FK -> `users.id` (CASCADE) |
| `name` | text | Not null |
| `description` | text | Optional description |
| `steps` | jsonb | Not null, array of `{ toolId, settings }` objects |
| `created_at` | timestamptz | Not null |

### audit_log

Append-only audit trail for compliance and forensics. Indexed on `created_at`, `action`, and `actor_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `actor_id` | text | FK -> `users.id` (SET NULL) |
| `actor_username` | text | Not null, denormalized for log durability |
| `action` | text | Not null (e.g. `user.login`, `tool.process`) |
| `target_type` | text | Entity type affected |
| `target_id` | text | Entity ID affected |
| `details` | jsonb | Action-specific metadata |
| `ip_address` | text | Client IP |
| `integrity` | text | HMAC integrity hash |
| `request_id` | text | Correlation ID for request tracing |
| `created_at` | timestamptz | Not null |

### roles

Custom role definitions. Three built-in roles (`admin`, `editor`, `user`) are seeded on first boot.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `name` | text | Unique, not null |
| `description` | text | Not null, default `''` |
| `permissions` | jsonb | Not null, array of permission strings |
| `tool_permissions` | jsonb | `{ mode, allowed }` or null (null = all tools) |
| `is_builtin` | boolean | Not null, default `false` |
| `created_by` | text | FK -> `users.id` (SET NULL) |
| `created_at` | timestamptz | Not null |
| `updated_at` | timestamptz | Not null |

### user_files

Persistent file library with version chain tracking. Each processing step that saves a result creates a new row linked to its parent via `parent_id`, forming a version tree.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `user_id` | text | FK -> `users.id` (CASCADE) |
| `original_name` | text | Not null, original upload filename |
| `stored_name` | text | Not null, filename on disk |
| `mime_type` | text | Not null |
| `size` | integer | Not null, file size in bytes |
| `width` | integer | Image width in px |
| `height` | integer | Image height in px |
| `version` | integer | Not null, default `1` (1 = original) |
| `parent_id` | text | Parent version ID (null = original upload) |
| `tool_chain` | jsonb | Array of tool IDs applied to produce this version |
| `created_at` | timestamptz | Not null |

### user_preferences

Per-user settings (UI preferences, tool defaults). Uses a composite primary key of `(user_id, key)`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | text | FK -> `users.id` (CASCADE), part of composite PK |
| `key` | text | Preference key, part of composite PK |
| `value` | jsonb | Not null, preference value |
| `updated_at` | timestamptz | Not null, auto-updated on write |

## Migrations

Drizzle manages schema migrations. The config is in `apps/api/drizzle.config.ts`. Migration files live in `apps/api/drizzle/`.

**Development workflow:**

```bash
# After changing apps/api/src/db/schema.ts, generate a migration:
cd apps/api && npx drizzle-kit generate

# Apply pending migrations:
cd apps/api && npx drizzle-kit migrate
```

In production (Docker), migrations are applied automatically on container startup.

### Upgrading from 1.x (SQLite)

If you are upgrading from SnapOtter 1.x, you can import the old SQLite database on first boot:

```yaml
environment:
  - SQLITE_MIGRATE_PATH=/data/snapotter.db
```

Remove or comment out the variable after the migration succeeds. The import is a one-time operation.
