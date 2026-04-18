# Docker Image

ashim ships three image tags, each optimised for a different hardware target.

| Tag | Platform | GPU |
|---|---|---|
| `latest` | amd64 + arm64 | CPU only |
| `latest-cuda` | amd64 | NVIDIA (CUDA wheels baked in) |
| `latest-rocm` | amd64 | AMD (ROCm wheels baked in) |

## Quick start

```bash
docker run -d --name ashim -p 1349:1349 -v ashim-data:/data ashimhq/ashim:latest
```

The app is available at `http://localhost:1349`.

## GPU acceleration

### NVIDIA

Pull `latest-cuda`. It has CUDA wheels baked in and sets `NVIDIA_VISIBLE_DEVICES=all` + `NVIDIA_DRIVER_CAPABILITIES=compute,utility` in the image env layer.

If the [NVIDIA Container Runtime](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) is configured as your **default** Docker runtime, GPUs are injected automatically — no flag needed:

```bash
docker run -d --name ashim -p 1349:1349 -v ashim-data:/data ashimhq/ashim:latest-cuda
```

Otherwise pass `--gpus all` explicitly:

```bash
docker run -d --name ashim --gpus all -p 1349:1349 -v ashim-data:/data ashimhq/ashim:latest-cuda
```

### AMD

Pull `latest-rocm`. ROCm requires device passthrough — this is always needed regardless of runtime configuration:

```bash
docker run -d --name ashim \
  --device=/dev/kfd --device=/dev/dri \
  -p 1349:1349 -v ashim-data:/data ashimhq/ashim:latest-rocm
```

### Benchmarks

Tested on an NVIDIA RTX 4070 (12 GB VRAM) with a 572x1024 JPEG portrait.

#### Warm performance

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal (u2net) | 2,415ms | 879ms | 2.7x |
| Background removal (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1.5x |
| Face blur | 139ms | 122ms | 1.1x |

#### Cold start (first request after container start)

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |
| OCR (PaddleOCR) | 1,469ms | 1,090ms | 1.3x |

### GPU health check

After the first AI request, the admin health endpoint reports GPU status:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose

```yaml
services:
  ashim:
    image: ashimhq/ashim:latest
    ports:
      - "1349:1349"
    volumes:
      - ashim-data:/data
      - ashim-workspace:/tmp/workspace
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  ashim-data:
  ashim-workspace:
```

For NVIDIA GPU acceleration via Docker Compose, use `latest-cuda` and add the deploy section (if the NVIDIA Container Runtime is not configured as your default runtime):

```yaml
services:
  ashim:
    image: ashimhq/ashim:latest-cuda
    ports:
      - "1349:1349"
    volumes:
      - ashim-data:/data
      - ashim-workspace:/tmp/workspace
      - ashim-models:/opt/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped

volumes:
  ashim-data:
  ashim-workspace:
  ashim-models:
```

For AMD GPU acceleration, use `latest-rocm` with device passthrough:

```yaml
services:
  ashim:
    image: ashimhq/ashim:latest-rocm
    ports:
      - "1349:1349"
    volumes:
      - ashim-data:/data
      - ashim-workspace:/tmp/workspace
      - ashim-models:/opt/models
    devices:
      - /dev/kfd:/dev/kfd
      - /dev/dri:/dev/dri
    restart: unless-stopped

volumes:
  ashim-data:
  ashim-workspace:
  ashim-models:
```

## Version pinning

| Tag | Description |
|-----|------------|
| `latest` | Latest release (CPU, multi-arch) |
| `latest-cuda` | Latest release (NVIDIA CUDA, amd64) |
| `latest-rocm` | Latest release (AMD ROCm, amd64) |
| `1.16.0` | Exact version (CPU) |
| `1.16.0-cuda` | Exact version (NVIDIA) |
| `1.16.0-rocm` | Exact version (AMD) |

## Platforms

| Tag | Architecture | GPU |
|---|---|---|
| `latest` | amd64 + arm64 | CPU only |
| `latest-cuda` | amd64 | NVIDIA CUDA |
| `latest-rocm` | amd64 | AMD ROCm |

ARM64 (Raspberry Pi 4/5, Apple Silicon) always uses `latest` — CUDA and ROCm wheels have no aarch64 builds.

## Model downloads

AI models are **not** baked into the image. On first container start, models are downloaded into the `/opt/models` volume (about 400 MB). Subsequent starts are instant.

Mount a named volume to persist models across container updates:

```bash
docker run -d --name ashim -p 1349:1349 \
  -v ashim-data:/data \
  -v ashim-models:/opt/models \
  ashimhq/ashim:latest
```

## Migration from v1.15 and earlier

Previous releases used `nvidia/cuda` as the base image and included `--gpus all` with the `latest` tag. As of v1.16, `latest` is CPU-only. Switch to `latest-cuda` for NVIDIA GPU acceleration. Your data and settings in volumes are unaffected.
