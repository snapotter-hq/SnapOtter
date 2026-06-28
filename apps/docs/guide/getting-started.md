---
description: Install SnapOtter with Docker in one command. Includes Docker Compose setup, building from source, and a full feature overview.
---

# Getting Started

::: tip Try before installing
Explore the full UI at [demo.snapotter.com](https://demo.snapotter.com) - no signup or install required.
:::

## Quick Start

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

You will be asked to change your password on first login.

::: tip NVIDIA GPU acceleration
Add `--gpus all` for GPU-accelerated background removal, upscaling, OCR, face enhancement, and restoration:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Falls back to CPU automatically. See [Docker Tags](/guide/docker-tags) for benchmarks.
:::

::: details Also on GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Both registries publish the same image on every release.
:::

## Docker Compose

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

See [Configuration](/guide/configuration) for all environment variables.

## Build from Source

**Prerequisites:** Node.js 22+, pnpm 9+, Docker (for Postgres + Redis), Python 3.10+ (for AI features), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## What You Can Do

### File Processing (240 Tools)

| Modality | Count | Example Tools |
|----------|-------|---------------|
| **Image** | 64 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools |
| **Video** | 29 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize |
| **Audio** | 17 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker |
| **PDF / Document** | 37 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines

Chain tools into multi-step workflows and apply them to one image or a whole batch:

1. Open **Pipelines** in the sidebar.
2. Add steps (any tool, any settings).
3. Run on a single file - or an entire batch at once.
4. Save the pipeline for later reuse.

Pipelines have unlimited steps by default.

### File Library

Every file you process can be saved to your **Files** library. SnapOtter tracks the full version history so you can trace every processing step from the original upload to the final output.

Saving is explicit: results you save to the library are kept until you delete them, while results you process and leave unsaved are cleared automatically after 72 hours (configurable via `FILE_MAX_AGE_HOURS`).

### REST API & API Keys

Every tool is accessible via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generate API keys under **Settings → API Keys**. See the [REST API reference](/api/rest) for all endpoints, or visit [http://localhost:1349/api/docs](http://localhost:1349/api/docs) for the interactive reference.

### Multi-User & Teams

Enable multiple users with role-based access control:

- **Admin**: full access - manage users, teams, settings, all files/pipelines/API keys
- **User**: use tools, manage own files/pipelines/API keys

Create teams under **Settings → Teams** to group users.

Set `AUTH_ENABLED=true` (or `false` for single-user/self-use without login).
