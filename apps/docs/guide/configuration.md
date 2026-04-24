# Configuration

All configuration is done through environment variables. Every variable has a sensible default, so SnapOtter works out of the box without setting any of them.

## Environment variables

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1349` | Port the server listens on. |
| `RATE_LIMIT_PER_MIN` | `0` (disabled) | Maximum requests per minute per IP. Set to 0 to disable rate limiting. |
| `CORS_ORIGIN` | (empty) | Comma-separated allowed origins for CORS, or empty for same-origin only. |
| `LOG_LEVEL` | `info` | Log verbosity. One of: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Trust `X-Forwarded-For` headers from a reverse proxy. Set to `false` if not behind a proxy. |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `false` | Set to `true` to require login. The Docker image defaults to `true`. |
| `DEFAULT_USERNAME` | `admin` | Username for the initial admin account. Only used on first run. |
| `DEFAULT_PASSWORD` | `admin` | Password for the initial admin account. Change this after first login. |
| `MAX_USERS` | `0` (unlimited) | Maximum number of registered user accounts. Set to 0 for unlimited. |
| `SESSION_DURATION_HOURS` | `168` | Login session lifetime in hours (default is 7 days). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Set to any non-empty value to bypass the forced password-change prompt on first login |

### Storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` or `s3`. Only local storage is currently implemented. |
| `DB_PATH` | `./data/snapotter.db` | Path to the SQLite database file. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directory for temporary files during processing. Cleaned up automatically. |
| `FILES_STORAGE_PATH` | `./data/files` | Directory for persistent user files (uploaded images, saved results). |

### Processing limits

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (unlimited) | Maximum file size per upload in megabytes. Set to 0 for unlimited. |
| `MAX_BATCH_SIZE` | `0` (unlimited) | Maximum number of files in a single batch request. Set to 0 for unlimited. |
| `CONCURRENT_JOBS` | `0` (auto) | Number of batch jobs that run in parallel. Set to 0 to auto-detect based on available CPU cores. |
| `MAX_MEGAPIXELS` | `0` (unlimited) | Maximum image resolution allowed in megapixels. Set to 0 for unlimited. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximum worker threads for image processing. Set to 0 to auto-detect based on available CPU cores. |
| `PROCESSING_TIMEOUT_S` | `0` (no limit) | Maximum processing time per request in seconds. Set to 0 for no timeout. |
| `MAX_PIPELINE_STEPS` | `0` (no limit) | Maximum number of steps in a pipeline. Set to 0 for no limit. |
| `MAX_CANVAS_PIXELS` | `0` (no limit) | Maximum canvas size in pixels for output images. Set to 0 for no limit. |
| `MAX_SVG_SIZE_MB` | `0` (unlimited) | Maximum SVG file size in megabytes. Set to 0 for unlimited. |
| `MAX_LOGO_SIZE_KB` | `500` | Maximum custom branding logo size in kilobytes. |
| `MAX_SPLIT_GRID` | `100` | Maximum grid dimension for the image split tool. |
| `MAX_PDF_PAGES` | `0` (unlimited) | Maximum number of PDF pages for PDF-to-image conversion. Set to 0 for unlimited. |

### Cleanup

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | How long temporary files are kept before automatic deletion. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | How often the cleanup job runs. |

### Appearance

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `SnapOtter` | Display name shown in the UI. |
| `DEFAULT_THEME` | `light` | Default theme for new sessions. `light` or `dark`. |
| `DEFAULT_LOCALE` | `en` | Default interface language. |

### Docker permissions

| Variable | Default | Description |
|---|---|---|
| `PUID` | `999` | Run the container process as this UID. Set to match your host user for bind mounts (`id -u`). |
| `PGID` | `999` | Run the container process as this GID. Set to match your host group for bind mounts (`id -g`). |

## Docker example

```yaml
services:
  SnapOtter:
    image: snapotterhq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    restart: unless-stopped
```

## Volumes

The Docker container uses two volumes:

- `/data` -- Persistent storage for the SQLite database and user files. Mount this to keep users, API keys, saved pipelines, and uploaded images across container restarts.
- `/tmp/workspace` -- Temporary storage for images being processed. This can be ephemeral, but mounting it avoids filling up the container's writable layer.
