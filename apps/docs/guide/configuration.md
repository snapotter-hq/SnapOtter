---
description: All SnapOtter environment variables with defaults. Configure auth, storage, AI models, analytics, and more.
---

# Configuration {#configuration}

All configuration is done through environment variables. Every variable has a sensible default, so SnapOtter works out of the box without setting any of them.

## Environment variables {#environment-variables}

### Server {#server}

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1349` | Port the server listens on. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximum requests per minute per IP. Set to 0 to disable rate limiting. |
| `CORS_ORIGIN` | (empty) | Comma-separated allowed origins for CORS, or empty for same-origin only. |
| `LOG_LEVEL` | `info` | Log verbosity. One of: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Trust `X-Forwarded-For` headers from a reverse proxy. Set to `false` if not behind a proxy. |

### Authentication {#authentication}

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `false` | Set to `true` to require login. The Docker image defaults to `true`. |
| `DEFAULT_USERNAME` | `admin` | Username for the initial admin account. Only used on first run. |
| `DEFAULT_PASSWORD` | `admin` | Password for the initial admin account. Change this after first login. |
| `MAX_USERS` | `0` (unlimited) | Maximum number of registered user accounts. Set to 0 for unlimited. |
| `SESSION_DURATION_HOURS` | `168` | Login session lifetime in hours (default is 7 days). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Set to any non-empty value to bypass the forced password-change prompt on first login |

### Storage {#storage}

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` or `s3`. S3/MinIO requires a license with the s3_storage feature. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL connection string. |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string (used for BullMQ job queues). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directory for temporary files during processing. Cleaned up automatically. |
| `FILES_STORAGE_PATH` | `./data/files` | Directory for persistent user files (uploaded images, saved results). |

### Embedded mode {#embedded-mode}

Run the image with no `DATABASE_URL` and no `REDIS_URL` and it starts its own PostgreSQL 17 and Redis inside the container, bound to loopback, with all data on the `/data` volume. This restores the single-command `docker run` experience for quick start, homelab, and upgrades from 1.x. It is a convenience path, not a production deployment: for production, run the 3-container Compose stack with separate PostgreSQL and Redis. Embedded mode requires running the container as root and is incompatible with arbitrary-UID runtimes (OpenShift, Kubernetes `runAsNonRoot`); use Compose there.

| Variable | Default | Description |
|---|---|---|
| `EMBEDDED` | `auto` | Auto-enabled when both `DATABASE_URL` and `REDIS_URL` are unset. Set to `0` to disable it (the app then fails fast if no external `DATABASE_URL`/`REDIS_URL` is set, rather than silently starting an in-container database). |
| `REDIS_MAXMEMORY` | `512mb` | Memory cap for the embedded Redis (embedded mode only). Lower it on memory-constrained hosts such as a Raspberry Pi. |

Upgrading from 1.x: put your old `snapotter.db` at `/data/snapotter.db` in the volume and embedded mode imports it into the embedded PostgreSQL on first boot. The import runs once; later boots skip it.

Telemetry note: embedded mode inherits the image's analytics default like any other configuration. The published image ships with analytics on; build with `--build-arg SNAPOTTER_ANALYTICS=off`, or use the in-app admin opt-out, to disable it.

### Processing limits {#processing-limits}

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Maximum file size per upload in megabytes. Set to 0 for unlimited. |
| `MAX_BATCH_SIZE` | `100` | Maximum number of files in a single batch request. Set to 0 for unlimited. |
| `CONCURRENT_JOBS` | `0` (auto) | Number of batch jobs that run in parallel. Set to 0 to auto-detect based on available CPU cores. |
| `MAX_MEGAPIXELS` | `0` (unlimited) | Maximum image resolution allowed in megapixels. Set to 0 for unlimited. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximum worker threads for image processing. Set to 0 to auto-detect based on available CPU cores. |
| `PROCESSING_TIMEOUT_S` | `0` (no limit) | Maximum processing time per request in seconds. Set to 0 for no timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Maximum number of steps in a pipeline. Set to 0 for no limit. |
| `MAX_CANVAS_PIXELS` | `0` (no limit) | Maximum canvas size in pixels for output images. Set to 0 for no limit. |
| `MAX_SVG_SIZE_MB` | `0` (unlimited) | Maximum SVG file size in megabytes. Set to 0 for unlimited. |
| `MAX_SPLIT_GRID` | `100` | Maximum grid dimension for the image split tool. |
| `MAX_PDF_PAGES` | `0` (unlimited) | Maximum number of PDF pages for PDF-to-image conversion. Set to 0 for unlimited. |

### Cleanup {#cleanup}

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | How long unsaved processing results (raw uploads and tool outputs) are kept before automatic deletion. Files you explicitly save to the Files library are not affected and persist until you delete them. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | How often the cleanup job runs. |

### Appearance {#appearance}

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | Default theme for new sessions. `light` or `dark`. |
| `DEFAULT_LOCALE` | `en` | Default interface language. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Default tool layout. `sidebar` or `fullscreen`. |

### Docker permissions {#docker-permissions}

| Variable | Default | Description |
|---|---|---|
| `PUID` | `999` | Run the container process as this UID. Set to match your host user for bind mounts (`id -u`). |
| `PGID` | `999` | Run the container process as this GID. Set to match your host group for bind mounts (`id -g`). |

## Docker example {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

The Docker Compose stack uses four volumes:

- `/data` (app) - AI models, Python venv, and user files. Mount this to keep uploaded files and installed AI bundles across restarts.
- `/tmp/workspace` (app) - Temporary storage for files being processed. This can be ephemeral, but mounting it avoids filling up the container's writable layer.
- `SnapOtter-pgdata` (postgres) - PostgreSQL data directory. This holds all relational data (users, settings, pipelines, jobs, audit log). Back up via `pg_dump` or volume snapshot.
- `SnapOtter-redisdata` (redis) - Redis append-only file for durable job queues.
