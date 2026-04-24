# Database

SnapOtter uses SQLite with [Drizzle ORM](https://orm.drizzle.team/) for data persistence. The schema is defined in `apps/api/src/db/schema.ts`.

The database file lives at the path set by `DB_PATH` (defaults to `./data/snapotter.db`). In Docker, mount the `/data` volume to persist it across container restarts.

## Tables

### users

Stores user accounts. Created automatically on first run from `DEFAULT_USERNAME` and `DEFAULT_PASSWORD`.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key, auto-increment |
| `username` | text | Unique, required |
| `passwordHash` | text | bcrypt hash |
| `role` | text | `admin` or `user` |
| `mustChangePassword` | integer | Boolean flag for forced password reset |
| `createdAt` | text | ISO timestamp |
| `updatedAt` | text | ISO timestamp |

### sessions

Active login sessions. Each row ties a session token to a user.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (session token) |
| `userId` | integer | Foreign key to `users.id` |
| `expiresAt` | text | ISO timestamp |
| `createdAt` | text | ISO timestamp |

### teams

Groups for organizing users. Admins can assign users to teams.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text UUID | Primary key |
| `name` | text (unique, max 50 chars) | Team name |
| `createdAt` | integer | Unix timestamp |

### api_keys

API keys for programmatic access. The raw key is shown once on creation; only the hash is stored.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key, auto-increment |
| `userId` | integer | Foreign key to `users.id` |
| `keyHash` | text | SHA-256 hash of the key |
| `name` | text | User-provided label |
| `createdAt` | text | ISO timestamp |
| `lastUsedAt` | text | Updated on each authenticated request |

Keys are prefixed with `si_` followed by 96 hex characters (48 random bytes).

### pipelines

Saved tool chains that users create in the UI.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key, auto-increment |
| `name` | text | Pipeline name |
| `description` | text | Optional description |
| `steps` | text | JSON array of `{ toolId, settings }` objects |
| `createdAt` | text | ISO timestamp |

### user_files

Persistent file library with version chain tracking. Each processing step that saves a result creates a new row linked to its parent via `parentId`, forming a version tree.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text UUID | Primary key |
| `userId` | text UUID | FK → users (CASCADE DELETE) |
| `originalName` | text | Original upload filename |
| `storedName` | text | Filename on disk |
| `mimeType` | text | MIME type |
| `size` | integer | File size in bytes |
| `width` | integer | Image width in px |
| `height` | integer | Image height in px |
| `version` | integer | Version number (1 = original) |
| `parentId` | text UUID \| null | FK → user_files (parent version) |
| `toolChain` | text (JSON array) | Tool IDs applied in order to produce this version |
| `createdAt` | integer | Unix timestamp |

### jobs

Tracks processing jobs for progress reporting and cleanup.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (UUID) |
| `type` | text | Tool or pipeline identifier |
| `status` | text | `queued`, `processing`, `completed`, or `failed` |
| `progress` | real | 0.0–1.0 fraction |
| `inputFiles` | text | JSON array of input file paths |
| `outputPath` | text | Path to the result file |
| `settings` | text | JSON of the tool settings used |
| `error` | text | Error message if failed |
| `createdAt` | text | ISO timestamp |
| `completedAt` | text | ISO timestamp |

### settings

Key-value store for server-wide settings that admins can change from the UI.

| Column | Type | Notes |
|---|---|---|
| `key` | text | Primary key |
| `value` | text | Setting value |
| `updatedAt` | text | ISO timestamp |

## Migrations

Drizzle handles schema migrations. The config is in `apps/api/drizzle.config.ts`. During development, run:

```bash
pnpm --filter @snapotter/api drizzle-kit push
```

In production, the schema is applied automatically on startup.
