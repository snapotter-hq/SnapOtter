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
| `HOST` | `0.0.0.0` | IP address the server listens on. On a bridge network (the default for `docker run` and Compose) keep `0.0.0.0` (or `::`), or published ports stop working. On a native install or a container on the host network, `127.0.0.1` keeps the API off the network; put a reverse proxy in front for remote access. [Embedded mode](#embedded-mode) works only with `0.0.0.0`, `::` or `127.0.0.1`, because its startup check calls `127.0.0.1`. With any other address, `::1` included, the container never counts as started, and a later crash stops it instead of restarting the server. Anything that isn't an IP address, `localhost` included, stops the server at startup. |
| `BASE_PATH` | (empty) | Public deployment path, e.g. `/snapotter`. Empty or `/` serves at the domain root. Applied at runtime; no image rebuild required. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximum requests per minute per IP. Set to 0 to disable rate limiting. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Maximum requests per minute per IP to the API key management endpoints (list, create, revoke). Keys in use for tool calls are not affected. Set to `0` for no limit. |
| `CORS_ORIGIN` | (empty) | Comma-separated allowed origins for CORS, or empty for same-origin only. |
| `LOG_LEVEL` | `info` | Log verbosity. One of: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Which peers may set the client IP through `X-Forwarded-For`. The default believes only a private-network peer, so a reverse proxy on a Docker network or a LAN is trusted and a public client's forged header is not. Set `true` only when a proxy you control sits in front on a public address. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (unset) | Answers the first-run analytics question in advance, so nobody is asked. Unset, a new instance asks its administrator and sends nothing until answered. `off` starts it with "Anonymous Product Analytics" switched off; `on` starts it switched on. It only fills in the setting while nobody has chosen one. Once the setting is saved, by an admin or by this variable, changing the variable does nothing; an admin can still change it under Settings > System > Privacy. |

### Authentication {#authentication}

The two booleans below accept only `true` and `false`. Anything else, `1` or `yes` or `on`, fails validation and the server exits before it starts listening.

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Require a login. Set to `false` to run with no accounts at all, which grants every request admin rights, so keep that to a trusted network. |
| `DEFAULT_USERNAME` | `admin` | Username for the initial admin account. Only used on first run. |
| `DEFAULT_PASSWORD` | `admin` | Password for the initial admin account. Change this after first login. |
| `MAX_USERS` | `0` (unlimited) | Maximum number of registered user accounts. Set to 0 for unlimited. |
| `SESSION_DURATION_HOURS` | `168` | Login session lifetime in hours (default is 7 days). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Set to `true` to skip the forced password-change prompt on first login. |
| `LOGIN_ATTEMPT_LIMIT` | `30` | Maximum login requests per minute per IP. Further attempts get a `429` until the minute is up. Repeated failures for one username usually hit `LOGIN_THROTTLE_MAX_FAILURES` first. An admin can override it under Settings > System. Set to `0` for no limit. A source build starts at 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Failed password logins one username may have inside `LOGIN_THROTTLE_WINDOW_S` before further attempts for it get a `429`, whatever IP they come from. They are let through again as the oldest failures age out of the window. Set to 0 to turn the throttle off. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Length of that window, in seconds. Must be at least 1; the server refuses to start on 0. |

### Storage {#storage}

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` or `s3`. S3 and MinIO need a license with the s3_storage feature plus the `S3_*` variables below. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL connection string, and the connection every request is served on. On 2.3.0 and later, set `DATABASE_MIGRATION_URL` too and this becomes the least-privilege runtime role, holding DML on the app's tables and nothing else. The Compose stack points it at its `postgres` service; leave it unset (together with `REDIS_URL`) to get embedded mode. To connect over a unix socket, name the socket directory in `host`, as in `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, and mount that directory into the container. |
| `DATABASE_MIGRATION_URL` | (empty) | Privileged connection, used only during boot to run migrations and grant the runtime role, then closed before the first request. Leave it empty and SnapOtter runs single-role, with `DATABASE_URL` doing both jobs. See [Least-privilege roles](/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (used for BullMQ job queues). Compose points this at its `redis` service. For a unix socket, use `unix:///run/redis/redis.sock?db=5` (add `&password=...` if Redis needs one) and mount the socket into the container. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directory for temporary files during processing. Cleaned up automatically. The image sets `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Directory for persistent user files (uploaded images, saved results). The image sets `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Cap in megabytes on what each user keeps in the Files library. A save that would pass it is refused with the amount used and the limit. A quota set on the user overrides it. Set to 0 for unlimited. |

### S3 object storage {#s3-object-storage}

Only read when `STORAGE_MODE=s3`. Miss any of the three required ones and startup fails with the name of the variable you left out.

| Variable | Default | Description |
|---|---|---|
| `S3_BUCKET` | (empty) | Bucket that holds uploads and outputs. Required. |
| `S3_ACCESS_KEY_ID` | (empty) | Access key. Required. In the container you can mount it instead, via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (empty) | Secret key. Required. Same file convention: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Bucket region. |
| `S3_ENDPOINT` | (empty) | Custom endpoint for MinIO, R2, Backblaze, and other S3-compatible stores. Empty means AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Set to `true` for MinIO and anything else that wants `endpoint/bucket/key` instead of virtual-host addressing. |
| `S3_PREFIX` | (empty) | Key prefix, so one bucket can hold several instances. |

### Encryption at rest {#encryption-at-rest}

| Variable | Default | Description |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (empty) | 64 hex characters (32 bytes). Encrypts sensitive settings stored in the database. Anything that is not 64 hex characters is rejected at startup. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (empty) | The key you are rotating away from, same format. Set both during a rotation so existing rows still decrypt, then drop this one. |

### Embedded mode {#embedded-mode}

Run the image with no `DATABASE_URL` and no `REDIS_URL` and it starts its own PostgreSQL 17 and Redis inside the container, bound to loopback, with all data on the `/data` volume. This restores the single-command `docker run` experience for quick start, homelab, and upgrades from 1.x. It is a convenience path, not a production deployment: for production, run the 3-container Compose stack with separate PostgreSQL and Redis. Embedded mode requires running the container as root and is incompatible with arbitrary-UID runtimes (OpenShift, Kubernetes `runAsNonRoot`); use Compose there.

| Variable | Default | Description |
|---|---|---|
| `EMBEDDED` | `auto` | Auto-enabled when both `DATABASE_URL` and `REDIS_URL` are unset. Set to `0` to disable it (the app then fails fast if no external `DATABASE_URL`/`REDIS_URL` is set, rather than silently starting an in-container database). |
| `REDIS_MAXMEMORY` | `512mb` | Memory cap for the embedded Redis (embedded mode only). Lower it on memory-constrained hosts such as a Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Loopback port for the embedded PostgreSQL (embedded mode only). Change it only when the container shares a network where 5432 is taken, such as `--network host`. It must differ from `EMBEDDED_REDIS_PORT` and be above 1023, because PostgreSQL runs as an unprivileged user that can't bind a privileged port on the host network. |
| `EMBEDDED_REDIS_PORT` | `6379` | Same, for the embedded Redis, which also runs as an unprivileged user. |
| `EMBEDDED_DB_PASSWORDS` | (empty) | Set to `1` to generate random passwords for the embedded PostgreSQL roles and Redis on the next boot, kept in `/data/.embedded-db-secrets`. TCP logins then need them. On a volume first created by 2.3.0 or later the PostgreSQL superuser can't log in over TCP at all; on an older volume the database owner is the superuser, and its password is what protects it. Use it whenever other programs share the container's network, such as with `--network host`. It stays on for that volume: the passwords are used on every boot even if you unset this, and deleting `/data/.embedded-db-secrets` only gets you new ones, or a boot that fails if the variable is unset. If the container won't start because one of those files is damaged, delete that file with `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` and start the container again; the next boot makes a new one. The variable takes `1`, `0` or empty, and any other value stops the boot. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Seconds the boot waits for the embedded Redis to answer `PING` before giving up. On timeout the container stops and logs why, instead of hanging. Whole seconds from 1 to 999999; there is no unlimited value, because waiting forever is the failure this bound exists to prevent. Raise it only if a slow host trips it. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Same, for the embedded PostgreSQL. The clock starts after first-boot `initdb` finishes, so it covers server start and crash recovery rather than the initial database creation. |

Upgrading from 1.x: put your old `snapotter.db` at `/data/snapotter.db` in the volume and embedded mode imports it into the embedded PostgreSQL on first boot. The import runs once; later boots skip it.

Telemetry note: embedded mode inherits the image's analytics default like any other configuration. The published image can send analytics, but a new instance asks its administrator first and sends nothing until answered. To disable it, answer no, build with `--build-arg SNAPOTTER_ANALYTICS=off`, set `SNAPOTTER_ANALYTICS_DEFAULT=off` before the first boot, or use the in-app admin opt-out.

### Processing limits {#processing-limits}

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (unlimited) | Maximum file size per upload in megabytes. Set to 0 for unlimited. The published image ships `0`; a source build starts at 100. |
| `MAX_BATCH_SIZE` | `0` (unlimited) | Maximum number of files in a single batch request. Set to 0 for unlimited. The published image ships `0`; a source build starts at 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Number of batch jobs that run in parallel. Set to 0 to auto-detect based on available CPU cores. |
| `MAX_MEGAPIXELS` | `0` (no app limit) | Maximum image resolution allowed in megapixels. Set to 0 to remove SnapOtter's own limit. The image decoder still refuses anything above about 268 MP (16383 x 16383 pixels), so a value above 268 has no extra effect. |
| `MAX_CPU_UPSCALE_MP` | `4` | Largest input, in megapixels, that AI upscaling takes on a host without a GPU. The upscaled output is also capped at 16 times this value (64 MP by default), so a high scale factor lowers the input limit further. A bigger image is reduced to fit before upscaling; if that would leave the result no bigger than the original, the request is refused instead. Lanczos skips the input limit but not the output cap. Set to 0 for no limit, which needs a lot of RAM: RealESRGAN always builds a 4x buffer internally. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (unlimited) | Cap in GB on the combined size of uploads and stored results in the workspace. Once it's passed, uploads and tool requests get a 503 until files expire after `FILE_MAX_AGE_HOURS`. Set to 0 for unlimited; local storage still refuses writes with a 503 once the disk has less than 0.5 GB free. The published image ships `0`; a source build starts at 10. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximum worker threads for image processing. Set to 0 to auto-detect based on available CPU cores. |
| `PROCESSING_TIMEOUT_S` | `0` (no limit) | Timeout for each call into the Python sidecar that runs the AI tools, in seconds. Set to 0 for no limit. It does not cap image, PDF, or media jobs; `JOB_TIMEOUT_FAST_S` and `JOB_TIMEOUT_LONG_S` do that. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Seconds the Python AI sidecar and the accurate OCR runtime sit idle before they exit and free their memory (about 1.3 GB and 0.7 GB once warm). Both start again on the next request, so the first AI call after an idle exit pays the library start-up cost, a few seconds. Set to 0 to keep them running. The default matches `AI_SESSION_IDLE_TIMEOUT`, so loaded models are not dropped earlier than that setting says. If you raise `AI_SESSION_IDLE_TIMEOUT`, raise this to match. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (auto) | Seconds a loaded AI model stays cached in the sidecar after its last use. Auto is 600. Read by the Python sidecar, which also drops every cached model when it exits after `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (auto) | Memory budget for cached AI models, in bytes. Auto is 40% of GPU memory, and no caching at all on a CPU-only host. Set it on a CPU host to cache models in RAM; set it to 1 to turn caching off on a GPU host. Read by the Python sidecar. |
| `MAX_AI_JOBS_PER_USER` | `5` | Single-file AI jobs one user may have queued or running at once. More get a `429` until one finishes. The AI pool runs one job at a time, so this keeps one user from holding it. Batch and pipeline AI runs don't count. Set to 0 for unlimited. |
| `JOB_TIMEOUT_FAST_S` | `120` | Deadline for one job on the fast pools (image and document tools), in seconds. A job that runs longer fails with a timeout error. Set to 0 for no limit. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Deadline for one job on the long pools (AI and media tools, plus any tool marked as long-running), in seconds. Set to 0 for no limit. Balanced and Best PDF OCR extend their own deadline by page count (2 and 5 minutes a page), up to 6 hours, so a large PDF doesn't need this raised. |
| `SYNC_WAIT_MS` | `8000` | How long a tool request waits for its job before the API stops waiting and returns `202` with a job id to follow over SSE, in milliseconds. It does not stop the job. Set to 0 to wait for the job however long it takes. |
| `MAX_PIPELINE_STEPS` | `20` | Maximum number of steps in a pipeline. Set to 0 for no limit. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Largest output a pipeline step may ask for, as width times height in pixels (the default is 8192 x 8192). A step whose settings ask for more is rejected before the pipeline runs. Set to 0 for no limit. |
| `MAX_CANVAS_PIXELS` | `0` (no limit) | Maximum canvas size in pixels for output images. Set to 0 for no limit. |
| `MAX_SVG_SIZE_MB` | `50` | Largest SVG accepted before sanitizing, in megabytes. `0` behaves differently here than in the rows around it. It removes the pre-parse size cap entirely rather than raising it, so leave this one set. |
| `MAX_PDF_PAGES` | `0` (unlimited) | Maximum number of PDF pages for PDF-to-image conversion. Set to 0 for unlimited. |
| `MAX_VIDEO_DURATION_S` | `0` (unlimited) | Longest video the video tools accept, in seconds. Longer files are rejected before processing, with the duration and the limit in the error. Set to 0 for unlimited. |
| `MAX_AUDIO_DURATION_S` | `0` (unlimited) | Same, for the audio tools. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (unlimited) | Highest overall bitrate the video tools accept, in kilobits per second. Set to 0 for unlimited. |
| `PREVIEW_TIMEOUT_S` | `300` | Time limit for encoding one in-browser preview clip of a video or audio file, in seconds. Document previews use `LIBREOFFICE_TIMEOUT_S` instead. Set to 0 for no limit. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Time limit for one LibreOffice conversion (Word, Excel and PowerPoint to PDF, the document converters, and document previews), in seconds. Set to `0` for no limit. |
| `GIF_BG_MAX_FRAMES` | `150` | Most frames Remove GIF Background accepts in one animation. Longer animations get a `400` that names the frame count. Set to 0 for no frame limit; a separate pixel budget still applies. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (off) | Address-space cap, in megabytes, for each of these helper processes: ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc and pdfcpu in the media and document engines, plus, for images, exiftool, the HEIF, JPEG XL and JPEG 2000 decoders and encoders, the RAW decoder and the ffmpeg fallback decoder. ImageMagick isn't capped, because it has memory limits of its own, and neither is the AI sidecar. A process that passes the cap is killed instead of pushing the whole container into the out-of-memory killer. It caps virtual memory, not resident memory, so set it well above what a process really uses. The JPEG XL encoder needs the most: a 24 MP image needed about 1.8 GB and failed at 1 GB, and more threads or CPUs don't change that much. While the cap is set, the HEIF encoder is held to two worker threads, which brings a 24 MP encode down to about 0.8 GB at the cost of a slower encode. Start at `2048` and lower it only after testing your largest files. Set to 0 to turn it off and rely on the container memory limit. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Largest `settings` field a tool request may carry, in kilobytes, counted in UTF-8 bytes. Requests over the limit get a `400`. Set to 0 for no limit. Real tool settings are far smaller than 64 KB, so raise this only if a client sends unusually large settings. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Largest subtitle file (`.srt`, `.vtt`, `.ass`) Burn Subtitles and Embed Subtitles accept, in megabytes. Larger files get a `400` that names the file size and the limit. Set to 0 for no limit. A feature-length subtitle file is usually well under 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Longest value Edit Metadata writes into a single tag (artist, description, keywords and so on), in characters. Longer values get a `400` that names the tag and the limit. Set to 0 for no limit. Raise it if you store long captions or descriptions. A tag value also has to fit inside `MAX_SETTINGS_PAYLOAD_KB` and the operating system's per-argument limit (128 KB on Linux). |

### Engines {#engines}

SnapOtter looks up each processing binary on `$PATH` inside the container, so these stay empty unless you mount a build of your own.

| Variable | Default | Description |
|---|---|---|
| `FFMPEG_PATH` | (empty) | Path to the `ffmpeg` binary behind the video and audio tools. |
| `FFPROBE_PATH` | (empty) | Path to `ffprobe`, which reads media files before they're processed. Point it at the same build as `FFMPEG_PATH`. |
| `QPDF_PATH` | (empty) | Path to `qpdf`, used by the PDF tools and to check uploaded PDFs. |
| `SOFFICE_PATH` | (empty) | Path to LibreOffice's `soffice`, used for office document conversions. |
| `PDFCPU_PATH` | (empty) | Path to `pdfcpu`, used by some PDF tools. |
| `GS_PATH` | (empty) | Path to Ghostscript's `gs`, used by the PDF tools and PDF OCR. |
| `PANDOC_PATH` | (empty) | Path to `pandoc`, used by document conversions. |
| `SNAPOTTER_FONT_FILE` | (empty) | Font file for text drawn onto video (burn subtitles, video watermark). Empty uses the first font the image finds. |
| `SNAPOTTER_FONT_FAMILY` | (empty) | Family name of `SNAPOTTER_FONT_FILE`. Empty means `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (empty) | Hardware video encoder family, `nvenc` or `vaapi`. Empty encodes in software. |

`SNAPOTTER_HW_ACCEL` needs an ffmpeg built with that encoder family, and the ffmpeg in the image has neither. With the image's own binary the setting falls back to software encoding and says so in the startup log. To use it, mount your own ffmpeg build, point `FFMPEG_PATH` and `FFPROBE_PATH` at it, and give the container the GPU device. For `nvenc`, also set `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: the image asks for `compute,utility` only, and without `video` the NVIDIA runtime doesn't mount the encode library, so the encoder is listed but every encode fails. A path override that doesn't exist or isn't executable is also named in the startup log, and every job that needs that binary fails until you fix the path or unset it.

The published Compose files pass all of them through from `.env`, so setting them there is enough.

### Cleanup {#cleanup}

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | How long unsaved processing results (raw uploads and tool outputs) are kept before automatic deletion. Files you explicitly save to the Files library are not affected and persist until you delete them. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | How often the cleanup job runs. |
| `JOBS_RETENTION_DAYS` | `30` | Days a finished job record (completed, failed or canceled) is kept before the retention sweep, which runs every 6 hours, deletes it. An admin can override it under Settings > System. Users and teams on legal hold keep theirs. Set to 0 to keep them forever. |
| `AUDIT_RETENTION_DAYS` | `0` (forever) | Days audit log entries are kept. Same override and legal hold rules. Nothing is deleted while tamper-resistant audit logging is on. Set to 0 to keep them forever. |

### Enterprise license {#enterprise-license}

| Variable | Default | Description |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (empty) | License key that unlocks the enterprise features, such as SAML, SCIM and S3 storage. Read at startup, so restart after changing it. An invalid or expired key logs a warning and the server runs without them. In the container you can mount it instead, via `SNAPOTTER_LICENSE_KEY_FILE` (see [Docker secrets](/guide/security#docker-secrets)). |

### Appearance {#appearance}

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | Default theme for new sessions. `light`, `dark`, or `system`. |
| `DEFAULT_LOCALE` | `en` | Default interface language. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Default tool layout. `sidebar` or `fullscreen`. |

### Docker permissions {#docker-permissions}

| Variable | Default | Description |
|---|---|---|
| `PUID` | `999` | Run the container process as this UID. Set to match your host user for bind mounts (`id -u`). Needs a writable root filesystem; see the [security guide](/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Run the container process as this GID. Set to match your host group for bind mounts (`id -g`). Needs a writable root filesystem; see the [security guide](/guide/security#why-read-only-is-not-set). |

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
