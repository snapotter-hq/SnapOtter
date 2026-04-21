# Deployment

ashim ships as a single Docker container. The image supports **linux/amd64** (with NVIDIA CUDA) and **linux/arm64** (CPU), so it runs natively on Intel/AMD servers, Apple Silicon Macs, and ARM devices like the Raspberry Pi 4/5.

See [Docker Image](./docker-tags) for GPU setup, Docker Compose examples, and version pinning.

## Quick Start (CPU)

```yaml
# docker-compose.yml — Copy this file and run: docker compose up -d
services:
  ashim:
    image: ashimhq/ashim:latest    # or ghcr.io/ashim-hq/ashim:latest
    container_name: ashim
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - ashim-data:/data           # Database, AI models, user files (PERSISTENT)
      - ashim-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

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

volumes:
  ashim-data:       # Named volume — Docker manages permissions automatically
  ashim-workspace:
```

```bash
docker compose up -d
```

The app is then available at `http://localhost:1349`.

> **Docker Hub rate limits?** Replace `ashimhq/ashim:latest` with `ghcr.io/ashim-hq/ashim:latest` to pull from GitHub Container Registry instead. Both registries receive the same image on every release.

## Quick Start (GPU)

For NVIDIA GPU acceleration on AI tools (background removal, upscaling, face enhancement, OCR):

```yaml
# docker-compose-gpu.yml — Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  ashim:
    image: ashimhq/ashim:latest
    container_name: ashim
    ports:
      - "1349:1349"
    volumes:
      - ashim-data:/data
      - ashim-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
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

volumes:
  ashim-data:
  ashim-workspace:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

Check GPU detection in the logs:

```bash
docker logs ashim 2>&1 | head -20
# Look for: [INFO] GPU detected — AI tools will use CUDA acceleration
```

## Hardware Requirements

### Minimum (basic image tools only)

| Resource | Requirement |
|---|---|
| CPU | 2 cores |
| RAM | 1 GB |
| Disk | 3 GB (image) + 1 GB (data volume) |
| GPU | Not required |

Basic tools (resize, crop, rotate, convert, watermark, border, etc.) work on any hardware. They use Sharp (libvips) and complete in milliseconds.

### Recommended (AI tools)

| Resource | Requirement |
|---|---|
| CPU | 4+ cores |
| RAM | 4 GB minimum, 8 GB recommended |
| Disk | 3 GB (image) + 10-25 GB (AI models, downloaded on first use) |
| GPU | NVIDIA with 4+ GB VRAM (optional but 5-20x faster) |

AI tools (background removal, upscaling, face enhancement, OCR, object erasing) download models on first use. Model sizes:

| Feature | Model Size | VRAM Usage |
|---|---|---|
| Background removal | ~200 MB | ~1 GB |
| Face detection | ~10 MB | ~500 MB |
| Upscale + Face enhance | ~1.5 GB | ~4 GB |
| OCR | ~200 MB | ~1 GB |
| Object eraser + Colorize | ~500 MB | ~2 GB |

### Heavy workloads (upscale + GFPGAN)

| Resource | Requirement |
|---|---|
| CPU | 8+ cores |
| RAM | 16 GB |
| GPU | NVIDIA with 8+ GB VRAM (RTX 3070 or better) |
| Disk | 30 GB total |

Upscaling a 4K image with face enhancement at 4x scale uses ~6 GB VRAM peak. Without a GPU, the same operation takes 5-10 minutes on CPU vs. 10-30 seconds on GPU.

## Volumes

| Mount | Purpose | Required? |
|---|---|---|
| `/data` | SQLite database, AI models, Python venv, user files | **Yes** — data loss without it |
| `/tmp/workspace` | Temporary processing files (auto-cleaned) | Recommended |

### Bind mounts vs. named volumes

**Named volumes** (recommended) — Docker manages permissions automatically:
```yaml
volumes:
  - ashim-data:/data
```

**Bind mounts** — You manage permissions. Set `PUID`/`PGID` to match your host user:
```yaml
volumes:
  - ./ashim-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

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
docker inspect --format='{{.State.Health.Status}}' ashim

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"1.15.9"}
```

## Reverse Proxy

ashim sets `TRUST_PROXY=true` by default so rate limiting and logging use the real client IP from `X-Forwarded-For` headers.

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
3. Set Scheme to `http`, Forward Hostname to `ashim` (or your container IP), Forward Port to `1349`
4. Enable WebSocket support
5. Under Advanced, add: `client_max_body_size 500M;` and `proxy_buffering off;`

### Traefik

```yaml
# Add these labels to the ashim service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.ashim.rule=Host(`images.example.com`)"
  - "traefik.http.routers.ashim.entrypoints=websecure"
  - "traefik.http.routers.ashim.tls.certresolver=letsencrypt"
  - "traefik.http.services.ashim.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.ashim-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.ashim.middlewares=ashim-body"
```

### Cloudflare Tunnels

```bash
cloudflared tunnel --url http://localhost:1349
```

Note: Cloudflare has a 100 MB upload limit on free plans. Set `MAX_UPLOAD_SIZE_MB=100` to match.

## CI/CD

The GitHub repository has three workflows:

- **ci.yml** -- Runs automatically on every push and PR. Lints, typechecks, tests, builds, and validates the Docker image (without pushing).
- **release.yml** -- Triggered manually via `workflow_dispatch`. Runs semantic-release to create a version tag and GitHub release, then builds a multi-arch Docker image (amd64 + arm64) and pushes to Docker Hub (`ashimhq/ashim`) and GitHub Container Registry (`ghcr.io/ashim-hq/ashim`).
- **deploy-docs.yml** -- Builds this documentation site and deploys it to GitHub Pages on push to `main`.

To create a release, go to **Actions > Release > Run workflow** in the GitHub UI, or run:

```bash
gh workflow run release.yml
```

Semantic-release determines the version from commit history. The `latest` Docker tag always points to the most recent release.
