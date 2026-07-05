---
description: Deploy SnapOtter to production with Docker. Hardware requirements, GPU setup, and reverse proxy configs for Nginx, Traefik, and Cloudflare.
---

# Deployment

SnapOtter deploys as a 3-container Docker Compose stack: the SnapOtter app image, PostgreSQL 17, and Redis 8. The app image supports **linux/amd64** (with NVIDIA CUDA for AI acceleration) and **linux/arm64** (CPU), so it runs natively on Intel/AMD servers, Apple Silicon Macs, and ARM devices like the Raspberry Pi 4/5. Intel/AMD iGPU acceleration through VA-API, Quick Sync, or OpenCL is not supported for AI inference today.

See [Docker Image](./docker-tags) for GPU setup, Docker Compose examples, and version pinning.

## Quick Start (CPU)

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=0     # API rate limit (0 = disabled, 100 = recommended for public)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

The app is then available at `http://localhost:1349`.

> **Docker Hub rate limits?** Replace `snapotter/snapotter:latest` with `ghcr.io/snapotter-hq/snapotter:latest` to pull from GitHub Container Registry instead. Both registries receive the same image on every release.

## Quick Start (NVIDIA CUDA)

For NVIDIA CUDA acceleration on AI tools (background removal, upscaling, face enhancement, OCR):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

Check CUDA detection in the logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hardware Requirements

These numbers come from benchmarks across a range of systems, from a modern amd64 workstation with an NVIDIA RTX 4070 down to a Raspberry Pi, running the whole tool catalog on each and sweeping Docker resource limits to find the real floor.

### Quick Reference

| Tier | Use Case | CPU | RAM | GPU | Storage |
|------|----------|-----|-----|-----|---------|
| Minimum | Image, data, and light PDF tools; single user; small batches | 2 cores | 2 GB | None | ~7 GB |
| Recommended | All five modalities incl. video, documents, and AI on CPU; batches; a few users | 4 cores | 4 GB | None | ~25 GB |
| Full | Everything at speed incl. GPU AI; large batches; many users | 6-8 cores | 8 GB | NVIDIA 8 GB+ VRAM (12 GB comfortable) | ~35 GB |

**Architecture: 64-bit only** (`linux/amd64` or `linux/arm64`). SnapOtter runs natively on Intel/AMD servers, Apple Silicon Macs, and 64-bit ARM boards including the **Raspberry Pi 4 and 5** (4-8 GB). It does **not** run on 32-bit ARM (`armv7`/`armhf`) — no image is built for it — nor on 512 MB-class boards such as the Pi Zero, which are below the memory floor (see below).

### Minimum (image, data, and light PDF tools; no AI)

| Resource | Requirement |
|---|---|
| CPU | 2 cores |
| RAM | 2 GB |
| Disk | ~5.5 GB (image) + data volume |
| GPU | Not required |

Every non-AI tool — image (resize, crop, convert, compress, adjust, watermark…), video (trim, mute, remux), audio (convert, normalize, trim), PDF (merge, split, compress, rotate, protect), and data/file conversions — runs on modest hardware. Most operations finish in well under a second even on a large file: a 2.7 MB image resizes in ~0.05 s and re-encodes to WebP in ~2 s.

The memory floor is real, from a Docker resource-limit sweep: **512 MB cannot start the stack** (even a single image resize is killed), **1 GB** handles single-file operations but a multi-file batch runs out of memory, and **2 GB / 2 cores** is the smallest configuration that handles batches comfortably.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**The one CPU-heavy exception is video re-encoding.** Stream-copy operations (trim, mute, container remux) are instant, but transcoding to a different codec is CPU-bound. A 1080p / 45-second clip re-encoded to VP9 (WebM) takes roughly **~40 s** on a fast modern CPU, ~45 s on Apple Silicon, ~80 s on an older mobile 4-core, and **~130 s** on an older 4-core server. If your workload is video-heavy, prioritize CPU cores and clock speed, or raise the container's `cpus:` limit — the shipped compose caps the app at 4 cores by default (8 on the GPU compose).

### Recommended (AI tools on CPU)

| Resource | Requirement |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 3 GB (image) + 14 GB (AI models) + workspace |
| GPU | Not required (CPU fallback) |

**Installing the AI bundles is what pushes RAM to 4 GB.** With no AI installed the app idles around 360 MB; with all seven bundles installed it holds ~2.6 GB resident, because the Python AI sidecar pre-loads its models (background removal, upscaling, OCR, transcription, face detection, restoration) at startup. Non-AI installs stay light; AI installs need ≥4 GB.

Most AI tools are perfectly usable on CPU; a couple really want a GPU. Measured on a modern 4-core CPU:

| AI Tool | CPU Time | Usable on CPU? |
|---|---|---|
| Face detection (blur-faces, smart-crop, red-eye), noise-removal | under 1 s | Yes |
| OCR, transcription, subtitles | 1-3 s | Yes |
| Colorize, face enhancement | ~10 s | Yes |
| Background removal / replace / blur | ~29 s | Yes (you'll wait) |
| AI upscale (RealESRGAN) | ~33 s small; minutes on large images | Marginal — GPU strongly recommended |
| Photo restoration (full pipeline) | several minutes | No — needs a GPU or a fast many-core CPU |

AI model download sizes:

| Bundle | Disk Size |
|---|---|
| Background removal | 3-4 GB |
| Upscale + Face enhance + Noise removal | 4-5 GB |
| Face detection | 200-300 MB |
| Object eraser + Colorize | 1-2 GB |
| OCR | 3-4 GB |
| Photo restoration | 800 MB - 1 GB |
| **All bundles** | **~14 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Full (AI tools on NVIDIA CUDA)

| Resource | Requirement |
|---|---|
| CPU | 6-8 cores (video prep + concurrency run on CPU even with GPU AI) |
| RAM | 8 GB |
| GPU | NVIDIA with 8+ GB VRAM (12 GB recommended) |
| Disk | ~35 GB total |

An NVIDIA GPU (CUDA) dramatically speeds up the heavy AI models. Measured on an RTX 4070 vs a modern CPU:

| AI Tool | Speedup with GPU | Notes |
|---|---|---|
| AI upscale (RealESRGAN 2×) | **~47×** | The biggest win — under a second vs ~33 s (minutes on large images) |
| Face enhancement (CodeFormer) | **~12×** | ~0.9 s vs ~11 s |
| Transcription (Whisper) | ~4.5× | |
| Background removal / replace / blur | ~4× | ~7 s on GPU vs ~29 s on CPU |
| Colorize | ~1.8× | |
| OCR, face detection, red-eye, noise-removal | ~1× | Already fast on CPU — a GPU doesn't help |
| Photo restoration | none | CPU-bound even on a GPU (0% GPU utilisation); a fast CPU matters more than a GPU here |

The tools worth a GPU are **upscale, face enhancement, transcription, and background removal**. Face detection, OCR, and red-eye are CPU-bound and already fast, so a GPU adds nothing.

Peak VRAM usage reaches 7.5 GB during upscale with face enhancement. A 6 GB NVIDIA GPU works for most AI tools individually but will fail on upscale. 8-12 GB VRAM handles everything.

Intel/AMD iGPU acceleration through VA-API, Quick Sync, or OpenCL is not supported for AI inference today. Mapping `/dev/dri` into the container does not enable AI GPU acceleration; SnapOtter will run AI tools on CPU unless NVIDIA CUDA is available.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Concurrent Users

Parallel image-resize requests against the default 4-core-capped app container:

| Concurrent Requests | Avg Response Time | Errors |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Response time degrades sub-linearly with no errors as the worker pool saturates. Raising the app container's `cpus:` limit (or using a host with more cores) lifts the ceiling. Note that heavy jobs (video transcode, CPU AI) hold a worker for their full duration, so size CPU to your expected number of concurrent heavy jobs, not just request count.

### Supported Image Formats

SnapOtter supports **55+ input formats** and **14 output formats**, including RAW files from 20+ camera brands, professional formats (PSD, EPS, OpenEXR, HDR), modern codecs (JPEG XL, AVIF, HEIC, QOI), and scientific/gaming formats (FITS, DDS).

See the [complete format list](/guide/supported-formats) for details on every supported format, decoder used, and available quality controls.

### Known Limitations

- **Content-aware resize** crashes on large images (>5 MP) due to a limitation in the caire binary. Works fine with smaller images.
- **HEIF decode** takes 13-23 seconds. HEIC (Apple's variant) is much faster at 0.3-0.9 seconds.
- **OCR Japanese** fails on CPU due to a PaddlePaddle MKLDNN bug. Works on GPU.
- **Upscale** times out on CPU for anything beyond small images. GPU required for practical use.
- **CodeFormer** face enhancement is significantly slower than GFPGAN (53s vs 2s on GPU). GFPGAN is recommended for most use cases.

## Volumes

| Mount / Volume | Purpose | Required? |
|---|---|---|
| `/data` (app) | AI models, Python venv, user files | **Yes** - file loss without it |
| `/tmp/workspace` (app) | Temporary processing files (auto-cleaned) | Recommended |
| `SnapOtter-pgdata` (postgres) | PostgreSQL data directory (users, settings, pipelines, jobs) | **Yes** - data loss without it |
| `SnapOtter-redisdata` (redis) | Redis append-only file for durable job queues | Recommended |

### Bind mounts vs. named volumes

**Named volumes** (recommended) — Docker manages permissions automatically:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — You manage permissions. Set `PUID`/`PGID` to match your host user:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Storage permissions

SnapOtter writes to two locations at runtime: `/data` (user files, logs, AI models and the Python venv) and `/tmp/workspace` (temporary processing scratch). Both must be writable by the user the container runs as. If either is not, the container **fails fast at startup** with a message naming the directory, the running UID/GID, and how to fix it — instead of booting "healthy" and then failing on the first upload with a cryptic error.

How permissions are handled depends on how the container is launched:

**Default (starts as root, drops to `snapotter`)** — the entrypoint starts as root, fixes ownership of the mounted volumes, then drops to the unprivileged `snapotter` user via `gosu`. Named volumes work with no configuration. For bind mounts, set `PUID`/`PGID` to your host user (above) so the files it writes are owned by you.

**Kubernetes / OpenShift (non-root via `runAsUser`)** — launched directly as a non-root user, the container cannot chown the volumes itself, so the orchestrator must make them writable. Set `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

The image's writable directories are group-owned by GID 0 and group-writable, so a pod running with an **arbitrary UID** plus the root supplementary group (the OpenShift default) can write with no `chown`.

**TrueNAS Scale (and other "foreign UID" setups)** — TrueNAS runs apps as a non-root user (often `568:568`) and mounts host datasets owned by a different user, so neither the entrypoint nor `fsGroup` makes them writable on its own. Choose one:

- **Run the app as root** (recommended) — leave the app's user unset or set it to `0`, and let the default entrypoint fix permissions and drop to `snapotter`.
- **Run as UID `999`** — set the app's user/group to `999:999` (SnapOtter's built-in `snapotter` user) so it matches the image's ownership.
- **`chown` the host dataset** to the UID the container runs as, from the TrueNAS shell:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

The startup error names the exact UID to use, so the quickest path is to start the app once, read the message, then `chown` (or adjust the user) accordingly.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Enable/disable login requirement |
| `DEFAULT_USERNAME` | `admin` | Initial admin username |
| `DEFAULT_PASSWORD` | `admin` | Initial admin password (forced change on first login) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Per-file upload limit |
| `MAX_BATCH_SIZE` | `100` | Max files per batch request |
| `RATE_LIMIT_PER_MIN` | `0` (disabled) | API requests per minute per IP |
| `MAX_USERS` | `0` (unlimited) | Maximum user accounts |
| `TRUST_PROXY` | `true` | Trust X-Forwarded-For headers from reverse proxy |
| `PUID` | `999` | Run as this UID (for bind mount permissions) |
| `PGID` | `999` | Run as this GID (for bind mount permissions) |
| `LOG_LEVEL` | `info` | Log verbosity: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max parallel AI processing jobs |
| `SESSION_DURATION_HOURS` | `168` | Login session lifetime (7 days) |
| `CORS_ORIGIN` | (empty) | Comma-separated allowed origins, or empty for same-origin |

## Health Check

The container includes a built-in health check:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy

SnapOtter sets `TRUST_PROXY=true` by default so rate limiting and logging use the real client IP from `X-Forwarded-For` headers.

### Nginx

```nginx
server {
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager

1. Add a new Proxy Host
2. Set Domain Name to your domain
3. Set Scheme to `http`, Forward Hostname to `SnapOtter` (or your container IP), Forward Port to `1349`
4. Enable WebSocket support
5. Under Advanced, add: `client_max_body_size 500M;` and `proxy_buffering off;`

### Traefik

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

### Caddy

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` disables response buffering, which is required for SSE progress events (batch processing, AI tools, feature installs). The extended timeouts allow large file uploads to complete without Caddy closing the connection early.

### Cloudflare Tunnels

```bash
cloudflared tunnel --url http://localhost:1349
```

Note: Cloudflare has a 100 MB upload limit on free plans. Set `MAX_UPLOAD_SIZE_MB=100` to match.

## CI/CD

The GitHub repository has three workflows:

- **ci.yml** - Runs automatically on every push and PR. Lints, typechecks, tests, builds, and validates the Docker image (without pushing).
- **release.yml** - Triggered manually via `workflow_dispatch`. Runs semantic-release to create a version tag and GitHub release, then builds a multi-arch Docker image (amd64 + arm64) and pushes to Docker Hub (`snapotter/snapotter`) and GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Builds this documentation site and deploys it to Cloudflare Pages on push to `main`.

To create a release, go to **Actions > Release > Run workflow** in the GitHub UI, or run:

```bash
gh workflow run release.yml
```

Semantic-release determines the version from commit history. The `latest` Docker tag always points to the most recent release.

## Analytics

SnapOtter includes anonymous product analytics (tool usage patterns, error reports) to help catch bugs and improve features. It is on by default. Your files, file names, and personal data are never part of this. SnapOtter works normally with analytics disabled.

### Disabling analytics

The runtime opt-out is a one-click admin toggle. Open Settings > System > Privacy and turn off Anonymous Product Analytics. It stops immediately for the whole instance, no rebuild required.

For an image that can never emit analytics, set the build-time hard-off by cloning the repository and rebuilding:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Or add the build arg to your existing `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
