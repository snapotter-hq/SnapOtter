# Docker Image

Stirling Image ships as a single Docker image that works on all platforms.

## Quick start

```bash
docker run -d -p 1349:1349 -v stirling-data:/data stirlingimage/stirling-image:latest
```

The app is available at `http://localhost:1349`.

## GPU acceleration

The image includes CUDA support on amd64. If you have an NVIDIA GPU with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed, add `--gpus all`:

```bash
docker run -d --gpus all -p 1349:1349 -v stirling-data:/data stirlingimage/stirling-image:latest
```

The image auto-detects your GPU at runtime. Without `--gpus all`, it runs on CPU. Same image either way.

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
  stirling-image:
    image: stirlingimage/stirling-image:latest
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
      - stirling-workspace:/tmp/workspace
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  stirling-data:
  stirling-workspace:
```

For GPU acceleration via Docker Compose, add the deploy section:

```yaml
services:
  stirling-image:
    image: stirlingimage/stirling-image:latest
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
      - stirling-workspace:/tmp/workspace
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped

volumes:
  stirling-data:
  stirling-workspace:
```

## Version pinning

| Tag | Description |
|-----|------------|
| `latest` | Latest release |
| `1.11.0` | Exact version |
| `1.11` | Latest patch in 1.11.x |
| `1` | Latest minor in 1.x |

## Platforms

| Architecture | GPU support | Notes |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Full GPU acceleration for AI tools |
| linux/arm64 | CPU only | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migration from previous tags

If you were using `:lite` or `:cuda` tags, switch to `:latest`:

- **From `:lite`**: Pull `:latest`. You now have all AI tools included.
- **From `:cuda`**: Pull `:latest` and keep `--gpus all`. Same GPU support, unified image.

Your data and settings are preserved in the volumes.
