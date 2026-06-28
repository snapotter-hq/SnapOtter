---
description: Deploy SnapOtter to production with Docker. Hardware requirements, GPU setup, and reverse proxy configs for Nginx, Traefik, and Cloudflare.
---

# Deployment

SnapOtter deploys as a 3-container Docker Compose stack: the SnapOtter app image, PostgreSQL 17, and Redis 8. The app image supports **linux/amd64** (with NVIDIA CUDA) and **linux/arm64** (CPU), so it runs natively on Intel/AMD servers, Apple Silicon Macs, and ARM devices like the Raspberry Pi 4/5.

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

      # --- Limits (0 = unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=0     # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=0         # Max files per batch request
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

## Quick Start (GPU)

For NVIDIA GPU acceleration on AI tools (background removal, upscaling, face enhancement, OCR):

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

Check GPU detection in the logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [INFO] GPU detected — AI tools will use CUDA acceleration
```

## Hardware Requirements

These numbers come from benchmarks run across four systems (Apple M2 Max, AMD Ryzen 5 7500F + RTX 4070, Intel i7-7600U, Docker Desktop on Windows).

### Quick Reference

| Tier | Use Case | CPU | RAM | GPU | Storage |
|------|----------|-----|-----|-----|---------|
| Minimum | Core tools, single user | 1 core | 1 GB | None | 5 GB |
| Recommended | All tools + AI on CPU | 4 cores | 4 GB | None | 20 GB |
| Full | All tools + AI on GPU | 4+ cores | 8 GB | NVIDIA 8 GB+ | 30 GB |

### Minimum (core tools, no AI)

| Resource | Requirement |
|---|---|
| CPU | 1 core |
| RAM | 1 GB |
| Disk | 3 GB (image) + 1 GB (data volume) |
| GPU | Not required |

All 138 non-AI tools (image resize/crop/convert, video trim/merge, audio normalize/convert, PDF merge/split/compress, data format conversion, and more) run on any hardware. Most operations complete in under 1 second even on a single core. The exception is AVIF encoding, which takes ~27s on 1 core but drops to ~5s on 4 cores.

```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
```

### Recommended (AI tools on CPU)

| Resource | Requirement |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 3 GB (image) + 14 GB (AI models) + workspace |
| GPU | Not required (CPU fallback) |

AI tools work on CPU but are significantly slower. Some tools are practical on CPU, others are not:

| AI Tool | CPU Time | Usable? |
|---|---|---|
| blur-faces, smart-crop, red-eye-removal | 2-5s | Yes |
| remove-background | 37-41s | Marginal (long wait) |
| upscale (small image) | 22s | Marginal |
| upscale (large image) | 241s | No |
| enhance-faces, colorize, noise-removal | 30-90s | Marginal to No |

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

### Full (AI tools on GPU)

| Resource | Requirement |
|---|---|
| CPU | 4+ cores |
| RAM | 8 GB |
| GPU | NVIDIA with 8+ GB VRAM (12 GB recommended) |
| Disk | 30 GB total |

GPU acceleration gives 3-13,000x speedup depending on the operation. Measured on an RTX 4070 vs Intel i7-7600U:

| AI Tool | GPU Time | CPU Time | Speedup |
|---|---|---|---|
| noise-removal (quick) | 17ms | 228s | 13,400x |
| blur-faces | 0.27s | 27s | 100x |
| upscale 2x | 6.3s | >300s (timeout) | 47x+ |
| enhance-faces (GFPGAN) | 2.3s | 28s | 12x |
| remove-background | 5-10s | 21-41s | 3-8x |
| OCR (best) | 70s | 243s | 3.5x |
| restore-photo | 31s | 90s | 2.9x |
| colorize | 10s | 13s | 1.3x |

Peak VRAM usage reaches 7.5 GB during upscale with face enhancement. A 6 GB GPU works for most AI tools individually but will fail on upscale. 8-12 GB VRAM handles everything.

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

Benchmarked with parallel resize requests on a large image (Mac M2 Max, 10 Docker CPUs):

| Concurrent Users | Avg Response Time | Errors |
|---|---|---|
| 1 | 0.28s | 0 |
| 5 | 0.54s | 0 |
| 10 | 1.08s | 0 |
| 20 | 2.10s | 0 |

The server scales linearly with no errors or crashes up to 20 concurrent requests.

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
| `MAX_UPLOAD_SIZE_MB` | `0` (unlimited) | Per-file upload limit |
| `MAX_BATCH_SIZE` | `0` (unlimited) | Max files per batch request |
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

```caddyfile
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
