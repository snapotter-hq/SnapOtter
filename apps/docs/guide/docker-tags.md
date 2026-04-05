# Docker Image Tags

Stirling Image ships three Docker image variants to fit different use cases.

## Full (default)

```bash
docker pull stirlingimage/stirling-image:latest
```

Includes all tools: image processing, AI-powered background removal, upscaling, face blurring, object erasing, and OCR. Size is ~11 GB due to bundled ML models.

## Lite

```bash
docker pull stirlingimage/stirling-image:lite
```

Includes all image processing tools (resize, crop, rotate, convert, compress, watermark, collage, and 20+ more) but excludes AI/ML tools. Size is ~1-2 GB.

Use this if you:
- Only need standard image processing (no AI features)
- Are running on constrained hardware (Raspberry Pi, small VPS)
- Want faster pulls and smaller disk footprint

### Tools excluded from lite

| Tool | What it does |
|------|-------------|
| Remove Background | AI-powered background removal |
| Upscale | AI super-resolution upscaling |
| Blur Faces | AI face detection and blurring |
| Erase Object | AI inpainting to remove objects |
| OCR | Optical character recognition |

All other tools (27+) work identically in both variants.

## CUDA (GPU acceleration)

```bash
docker pull stirlingimage/stirling-image:cuda
```

Same tools as the full image, but built with GPU-accelerated Python packages (onnxruntime-gpu, PyTorch CUDA, PaddlePaddle GPU). The image auto-detects your NVIDIA GPU at runtime and falls back to CPU if none is found.

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host. Linux amd64 only.

### What gets faster with GPU

| Tool | CPU | GPU (RTX 4070) | Speedup |
|------|-----|----------------|---------|
| Background removal | 2.4s | 0.9s | 2.7x |
| Upscale 2x | 350ms | 310ms | ~1.1x |
| Upscale 4x | 910ms | 310ms | ~3x |
| OCR (PaddleOCR) | 137ms | 94ms | ~1.5x |

Benchmarked with a 572x1024 JPEG portrait. Larger images show bigger speedups, especially for upscaling.

Non-AI tools (resize, crop, convert, etc.) are unaffected since they use Sharp (CPU-based).

### GPU health check

After the first AI request, the admin health endpoint reports GPU status:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose

### Full

```yaml
services:
  stirling-image:
    image: stirlingimage/stirling-image:latest
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
      - stirling-workspace:/tmp/workspace

volumes:
  stirling-data:
  stirling-workspace:
```

### Lite

```yaml
services:
  stirling-image:
    image: stirlingimage/stirling-image:lite
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
      - stirling-workspace:/tmp/workspace

volumes:
  stirling-data:
  stirling-workspace:
```

### CUDA

```yaml
services:
  stirling-image:
    image: stirlingimage/stirling-image:cuda
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

volumes:
  stirling-data:
  stirling-workspace:
```

## Switching from lite to full

To upgrade from lite to full and unlock AI tools:

1. Stop your container
2. Pull the full image: `docker pull stirlingimage/stirling-image:latest`
3. Update your compose file or run command to use `:latest` instead of `:lite`
4. Start the container

Your data and settings are preserved in the volumes.

## Version pinning

Both variants support semver tags for pinning:

| Tag | Description |
|-----|------------|
| `latest` | Latest full release |
| `lite` | Latest lite release |
| `cuda` | Latest full release with GPU support |
| `1.6.0` | Exact full version |
| `1.6.0-lite` | Exact lite version |
| `1.6.0-cuda` | Exact CUDA version |
| `1.6` | Latest patch in 1.6.x (full) |
| `1.6-lite` | Latest patch in 1.6.x (lite) |
| `1.6-cuda` | Latest patch in 1.6.x (CUDA) |
