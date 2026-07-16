# Low-Resource Setups {#low-resource-setups}

SnapOtter runs well on small hardware: a Raspberry Pi 4 or 5, an old laptop, or a 2 GB VPS. This page is the practical guide for those machines: what to expect, a copy-paste setup with sensible caps, and which features to skip. The full benchmark data behind these numbers lives in [Hardware Requirements](/guide/deployment#hardware-requirements).

Two hard constraints up front:

- **64-bit only.** The image is built for `linux/amd64` and `linux/arm64`. 32-bit ARM (`armv7`/`armhf`) is not supported, so first-generation Pis and the Pi Zero family are out.
- **2 GB memory floor.** 512 MB cannot start the stack, and 1 GB fails on multi-file batches. 2 GB with 2 cores is the smallest configuration that works comfortably.

## What runs well on small hardware {#what-runs-well}

Every non-AI tool works on a 2 GB / 2-core machine: the whole Image and Files sections, PDF tools, and the stream-copy video and audio operations (trim, mute, container remux). Most finish in under a second.

Two workloads are the exceptions:

- **Video re-encoding** (converting between codecs) is CPU-bound. A 1080p clip that takes ~40 s on a fast desktop CPU can take several minutes on a Pi-class CPU. Stream-copy operations stay instant.
- **AI tools** need RAM (4 GB recommended) and disk (the larger bundles are 4-5 GB each), and the heavy ones (upscaling, photo restoration, background removal) are not practical on Pi-class CPUs. Light AI such as face detection and OCR is usable if you have the memory for it.

Neither is installed or running unless you use it: with no AI bundles installed the app idles around 360 MB, and AI bundles only download when an admin enables them.

## Raspberry Pi / old laptop walkthrough {#walkthrough}

This is the standard Compose install from [Getting Started](/guide/getting-started), plus resource limits and conservative caps. It assumes a 64-bit OS (on a Pi: Raspberry Pi OS 64-bit or Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Notes for Pi-class machines:

- **Prefer a USB SSD over an SD card** for the data volume and Postgres. Job workspaces do real disk IO, and SD cards are both slow and quick to wear out.
- **The all-in-one single container also works here** (embedded Postgres and Redis when `DATABASE_URL`/`REDIS_URL` are unset), and on a memory-constrained host you should lower its embedded Redis cap with `REDIS_MAXMEMORY` (see [Configuration](/guide/configuration)). Compose gives you finer per-service control, which is why this walkthrough uses it.
- **Add swap on 2 GB devices.** It keeps the occasional spike (a large PDF, a batch you forgot to cap) from ending in an out-of-memory kill. zram is the SD-card-friendly option.
- The arm64 image is CPU-only; there is no CUDA on ARM boards.

## The tuning knobs {#tuning-knobs}

All caps are environment variables, documented fully in [Configuration](/guide/configuration). `0` means unlimited or auto. The ones that matter on small hardware:

| Variable | Small-box suggestion | What it protects |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | How many jobs run in parallel. Auto-detect uses CPU cores minus one, which is fine on big machines and too eager on a 2-core box under memory pressure. |
| `MAX_WORKER_THREADS` | `2` | Image-processing thread pool. |
| `MAX_BATCH_SIZE` | `5` | Batches are where 1-2 GB machines run out of memory first. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Keeps a single huge file from occupying the whole workspace. |
| `MAX_MEGAPIXELS` | `50` | Decoding a 100+ MP image costs RAM regardless of file size. |
| `MAX_VIDEO_DURATION_S` | `300` | Long transcodes monopolize a small CPU for minutes to hours. |
| `PROCESSING_TIMEOUT_S` | `600` | Hard ceiling so a runaway job frees the box eventually. |

These caps apply to what the server accepts, so set them to match what you actually use rather than as small as possible. If you never touch video, a `MAX_VIDEO_DURATION_S` cap costs nothing; if you scan documents daily, do not cap `MAX_PDF_PAGES`.

## What to skip {#what-to-skip}

- **Heavy AI bundles.** Upscaling, photo restoration, and background removal want a GPU or a fast many-core CPU, and each bundle costs 4-5 GB of disk. On a small box, simply do not install them; tools whose bundle is missing show an install prompt instead of running.
- **Video re-encoding as a routine workload.** Occasional transcodes are fine (they are just slow); a steady transcode queue wants CPU cores, not a Pi.
- **Unused tools generally.** An admin can turn off individual tools in Settings, which removes them from the UI and stops registering their API routes. That does not save memory by itself, but it keeps a shared small instance from being used for the one workload the hardware cannot take.

If you later move the instance to bigger hardware, remove the caps (set them back to `0`) and the same data volume carries over.
