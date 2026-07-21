---
description: Install SnapOtter with Docker in one command. Includes Docker Compose setup, building from source, and a full feature overview.
---

# Getting Started {#getting-started}

::: tip Try before installing
Explore the full UI at [demo.snapotter.com](https://demo.snapotter.com) - no signup or install required.
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

This single container runs everything it needs: with no `DATABASE_URL` set, it starts its own PostgreSQL and Redis on the loopback interface (embedded mode) and keeps all data in the `SnapOtter-data` volume. It is the fastest way to try SnapOtter or self-host on a homelab. For production, run the [Docker Compose](#docker-compose) stack below, which keeps PostgreSQL and Redis in their own containers. Embedded mode runs as root (the default) and turns off automatically as soon as you set `DATABASE_URL`.

Installing on a Raspberry Pi, an old laptop, or a small VPS? See [Low-Resource Setups](/guide/low-resource) for a tuned walkthrough and what to expect from constrained hardware.

You will be asked to change your password on first login.

::: tip Anonymous Product Analytics
SnapOtter includes anonymous product analytics by default. To turn it off, open **Settings → System → Privacy** and switch off **Anonymous Product Analytics**. It stops immediately for the whole instance.

You can also set the environment variable `SNAPOTTER_TELEMETRY=0` (`false` and `off` work too) to disable all telemetry for the instance without a rebuild.

Error monitoring is powered by [Sentry](https://sentry.io), which sponsors SnapOtter through its open-source program.

For details about what is collected, see [What SnapOtter collects](/guide/telemetry).
:::

::: tip NVIDIA CUDA acceleration
Add `--gpus all` for NVIDIA CUDA-accelerated background removal, upscaling, face enhancement, and restoration. OCR remains CPU-based and works in the same image with or without GPU access:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Falls back to CPU automatically when CUDA is unavailable. Intel/AMD iGPU acceleration through VA-API, Quick Sync, or OpenCL is not supported for AI inference today. See [Docker Tags](/guide/docker-tags) for benchmarks. If AI tools run on CPU despite `--gpus all`, see [Verify GPU acceleration](/guide/deployment#verify-gpu-acceleration).
:::

::: details Also on GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Both registries publish the same image on every release.
:::

## Docker Compose {#docker-compose}

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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

See [Configuration](/guide/configuration) for all environment variables.

## Build from Source {#build-from-source}

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

## What You Can Do {#what-you-can-do}

### File Processing (200+ Tools) {#file-processing-200-tools}

| Modality | Count | Example Tools |
|----------|-------|---------------|
| **Image** | 107 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Document** | 42 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines {#pipelines}

Chain tools into multi-step workflows and apply them to one image or a whole batch:

1. Open **Pipelines** in the sidebar.
2. Add steps (any tool, any settings).
3. Run on a single file - or an entire batch at once.
4. Save the pipeline for later reuse.

Pipelines allow 20 steps by default. Set `MAX_PIPELINE_STEPS=0` to make the limit unlimited.

### File Library {#file-library}

Every file you process can be saved to your **Files** library. SnapOtter tracks the full version history so you can trace every processing step from the original upload to the final output.

Saving is explicit: results you save to the library are kept until you delete them, while results you process and leave unsaved are cleared automatically after 72 hours (configurable via `FILE_MAX_AGE_HOURS`).

### REST API & API Keys {#rest-api-api-keys}

Every tool is accessible via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generate API keys under **Settings → API Keys**. See the [REST API reference](/api/rest) for all endpoints, or visit [http://localhost:1349/api/docs](http://localhost:1349/api/docs) for the interactive reference.

### Multi-User & Teams {#multi-user-teams}

Enable multiple users with role-based access control:

- **Admin**: full access - manage users, teams, settings, all files/pipelines/API keys
- **User**: use tools, manage own files/pipelines/API keys

Create teams under **Settings → Teams** to group users.

Set `AUTH_ENABLED=true` (or `false` for single-user/self-use without login).
