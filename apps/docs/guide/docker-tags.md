---
description: SnapOtter Docker image tags, GPU benchmarks, version pinning, and multi-platform support for AMD64 and ARM64.
---

# Docker Image {#docker-image}

SnapOtter ships as a single Docker image. Run it on its own and it starts an embedded PostgreSQL 17 and Redis on the loopback interface (embedded mode); for production, run it alongside separate PostgreSQL 17 and Redis 8 containers with Compose. The app image works on all platforms.

## Quick start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

With no `DATABASE_URL` set, this runs in embedded mode: PostgreSQL and Redis start inside the container on loopback, with all data under the `SnapOtter-data` volume. Set `DATABASE_URL` and `REDIS_URL` (as the [Compose](#docker-compose) stack does) to use external services instead. See [Configuration](/guide/configuration#embedded-mode).

## NVIDIA CUDA acceleration {#nvidia-cuda-acceleration}

The image includes NVIDIA CUDA support on amd64. If you have an NVIDIA GPU with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed, add `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

The image auto-detects CUDA at runtime. Without `--gpus all`, or when CUDA is unavailable, AI tools run on CPU. Same image either way.

Intel/AMD iGPU acceleration through VA-API, Quick Sync, or OpenCL is not supported for SnapOtter AI inference today. Mapping `/dev/dri` into the container can expose the render device, but the AI runtime will still use CPU unless CUDA is available.

### Benchmarks {#benchmarks}

Tested on an NVIDIA RTX 4070 (12 GB VRAM) with a 572x1024 JPEG portrait.

#### Warm performance {#warm-performance}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal (u2net) | 2,415ms | 879ms | 2.7x |
| Background removal (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1.5x |
| Face blur | 139ms | 122ms | 1.1x |

#### Cold start (first request after container start) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |
| OCR (PaddleOCR) | 1,469ms | 1,090ms | 1.3x |

### CUDA health check {#cuda-health-check}

After the first AI request, the admin health endpoint reports CUDA GPU status:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

The full Compose stack includes the app, PostgreSQL 17, and Redis 8. See [Deployment](/guide/deployment) for the complete `docker-compose.yml`. A minimal example:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
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

For NVIDIA CUDA acceleration via Docker Compose, add the deploy section to the SnapOtter service:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Version pinning {#version-pinning}

| Tag | Description |
|-----|------------|
| `latest` | Latest release |
| `1.11.0` | Exact version |
| `1.11` | Latest patch in 1.11.x |
| `1` | Latest minor in 1.x |

## Platforms {#platforms}

| Architecture | GPU support | Notes |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Full CUDA acceleration for AI tools |
| linux/arm64 | CPU only | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migration from previous tags {#migration-from-previous-tags}

If you were using the `:cuda` tag, switch to `:latest` and keep `--gpus all`. Same GPU support, unified image.

Your data and settings are preserved in the volumes.
