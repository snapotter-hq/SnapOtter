# Getting Started

## Quick Start

```bash
docker run -d --name ashim -p 1349:1349 -v ashim-data:/data ghcr.io/ashim-hq/ashim:latest
```

Open [http://localhost:1349](http://localhost:1349) in your browser.

::: tip Also on Docker Hub
```bash
docker run -d --name ashim -p 1349:1349 -v ashim-data:/data ashimhq/ashim:latest
```

Both registries publish the same image on every release.
:::

**Default credentials:**

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

You will be asked to change your password on first login.

::: tip NVIDIA GPU acceleration
Use the `latest-cuda` tag for GPU-accelerated background removal, upscaling, OCR, face enhancement, and restoration:

```bash
docker run -d --name ashim -p 1349:1349 --gpus all \
  -v ashim-data:/data ashimhq/ashim:latest-cuda
```

Requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). If the NVIDIA Container Runtime is your default Docker runtime, `--gpus all` is optional. See [Docker Tags](/guide/docker-tags) for benchmarks.
:::

::: tip AMD GPU acceleration
Use the `latest-rocm` tag with device passthrough:

```bash
docker run -d --name ashim -p 1349:1349 \
  --device=/dev/kfd --device=/dev/dri \
  -v ashim-data:/data ashimhq/ashim:latest-rocm
```
:::

## Docker Compose

```yaml
services:
  ashim:
    image: ghcr.io/ashim-hq/ashim:latest  # or ashimhq/ashim:latest
    ports:
      - "1349:1349"
    volumes:
      - ashim-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
    restart: unless-stopped

volumes:
  ashim-data:
```

See [Configuration](/guide/configuration) for all environment variables.

## Build from Source

**Prerequisites:** Node.js 22+, pnpm 9+, Python 3.10+ (for AI features), Git.

```bash
git clone https://github.com/ashim-hq/ashim.git
cd ashim
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## What You Can Do

### Image Processing (45+ Tools)

| Category | Tools |
|----------|-------|
| **Essentials** | Resize, Crop, Rotate & Flip, Convert, Compress |
| **Optimization** | Optimize for Web, Strip Metadata, Edit Metadata, Bulk Rename, Image to PDF, Favicon Generator |
| **Adjustments** | Adjust Colors, Sharpening, Replace Color |
| **AI Tools** | Remove Background, Upscale, Erase Object, OCR, Blur Faces, Smart Crop, Image Enhancement, Enhance Faces, Colorize, Noise Removal, Red Eye Removal, Restore Photo, Passport Photo, Content-Aware Resize |
| **Watermark & Overlay** | Text Watermark, Image Watermark, Text Overlay, Image Composition |
| **Utilities** | Image Info, Compare, Find Duplicates, Color Palette, QR Code Generator, Barcode Reader, Image to Base64 |
| **Layout** | Collage, Stitch, Split, Border & Frame |
| **Format** | SVG to Raster, Vectorize, GIF Tools, PDF to Image |

### Pipelines

Chain tools into multi-step workflows and apply them to one image or a whole batch:

1. Open **Pipelines** in the sidebar.
2. Add steps (any tool, any settings).
3. Run on a single file - or up to 200 files at once.
4. Save the pipeline for later reuse.

Pipelines can have up to 20 steps.

### File Library

Every file you process can be saved to your **Files** library. ashim tracks the full version history so you can trace every processing step from the original upload to the final output.

### REST API & API Keys

Every tool is accessible via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/resize \
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
