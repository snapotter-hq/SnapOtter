<p align="center">
  <h1 align="center">Stirling Image</h1>
  <p align="center">The Open-Source Image Processing Platform</p>
</p>

<p align="center">
  <a href="https://github.com/siddharthksah/Stirling-Image/pkgs/container/stirling-image"><img src="https://img.shields.io/badge/Docker-ghcr.io-blue?logo=docker" alt="Docker"></a>
  <a href="https://github.com/siddharthksah/Stirling-Image/actions"><img src="https://img.shields.io/github/actions/workflow/status/siddharthksah/Stirling-Image/ci.yml?label=CI" alt="CI"></a>
  <a href="https://github.com/siddharthksah/Stirling-Image/blob/main/LICENSE"><img src="https://img.shields.io/github/license/siddharthksah/Stirling-Image" alt="License"></a>
  <a href="https://github.com/siddharthksah/Stirling-Image/stargazers"><img src="https://img.shields.io/github/stars/siddharthksah/Stirling-Image?style=social" alt="Stars"></a>
</p>

---

Self-hosted image processing with 33+ tools in a single Docker container. Resize, compress, convert, watermark, remove backgrounds, run OCR, and more. Nothing leaves your server.

Inspired by [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF), built for images.

<!-- TODO: Add screenshot here -->
<!-- ![Dashboard](docs/screenshot-dashboard.png) -->

## Quick start

```bash
docker run -d -p 1349:1349 -v ./data:/data ghcr.io/siddharthksah/stirling-image:latest
```

Open [http://localhost:1349](http://localhost:1349). Default login is `admin` / `admin`.

## What it does

- **33+ image tools** in one place — resize, crop, rotate, compress, convert, watermark, color adjustments, and the rest.

- **AI tools that run locally** — background removal (rembg), upscaling (Real-ESRGAN), OCR (PaddleOCR), face blurring (MediaPipe), object erasing (LaMa). No external API calls.

- **Your hardware, your data** — no telemetry, no tracking, no cloud. Files stay on your machine.

- **Batch processing** — drop up to 200 images, apply any tool, get a ZIP back. Configurable concurrency.

- **Pipelines** — chain tools into reusable workflows (resize, then compress, then convert to WebP, then strip metadata). Save them and rerun later.

- **REST API** — every tool is exposed at `/api/v1/tools/:toolId`. Swagger docs at `/api/docs`.

- **Persistent file storage** — save processed images server-side with version tracking. Pick up where you left off.

- **Teams and admin settings** — manage users, toggle tool visibility, configure cleanup, upload a custom logo.

- **Single container** — runs on Intel, AMD, and Apple Silicon (`linux/amd64` + `linux/arm64`).

## Tools

| Category | Tools |
|----------|-------|
| **Essentials** | Resize, Crop, Rotate & Flip, Convert, Compress |
| **Optimization** | Strip Metadata, Bulk Rename, Image to PDF, Favicon Generator |
| **Adjustments** | Brightness/Contrast, Saturation, Color Channels, Color Effects, Replace Color |
| **AI Tools** | Background Removal, Upscaling, Object Eraser, OCR, Face Blur, Smart Crop |
| **Watermark** | Text Watermark, Image Watermark, Text Overlay, Image Composition |
| **Utilities** | Image Info, Compare, Find Duplicates, Color Palette, QR Generator, Barcode Reader |
| **Layout** | Collage/Grid, Image Splitting, Border & Frame |
| **Format** | SVG to Raster, Image to SVG, GIF Tools |
| **Automation** | Pipeline Builder, Batch Processing |

## Supported formats

**In:** JPG, PNG, WebP, AVIF, TIFF, BMP, GIF (animated), SVG, HEIC/HEIF, JPEG XL, ICO, RAW (CR2, NEF, ARW, DNG)

**Out:** JPG, PNG, WebP, AVIF, TIFF, GIF, JPEG XL, SVG, ICO, PDF

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `1349` | Server port |
| `AUTH_ENABLED` | `true` | Require login (`admin` / `admin` by default) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Max file upload size |
| `MAX_BATCH_SIZE` | `200` | Max files per batch |
| `CONCURRENT_JOBS` | `3` | Parallel processing limit |
| `FILE_MAX_AGE_HOURS` | `24` | Auto-delete temp files after this many hours |
| `FILES_STORAGE_PATH` | `./data/files` | Where persistent user files are stored |
| `STORAGE_MODE` | `local` | Storage backend (`local` or `s3`) |

See [`.env.example`](.env.example) for the full list.

## Docker Compose example

```yaml
services:
  stirling-image:
    image: ghcr.io/siddharthksah/stirling-image:latest
    container_name: stirling-image
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
    restart: unless-stopped

volumes:
  stirling-data:
```

## Development

```bash
git clone https://github.com/siddharthksah/Stirling-Image.git
cd Stirling-Image
pnpm install
pnpm dev
# UI: http://localhost:1349
```

Requires Node.js 22+ and pnpm 9+.

## Tech stack

React 19 + Vite frontend, Fastify + Sharp backend, SQLite via Drizzle ORM, Python sidecar for AI/ML models. Monorepo with pnpm workspaces. Multi-arch Docker builds.

## Support this project

If you find this useful, consider supporting development:

<p align="center">
  <a href="https://github.com/sponsors/siddharthksah"><img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github-sponsors" alt="GitHub Sponsors"></a>
  <a href="https://ko-fi.com/siddharthksah"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Ko--fi-FF5E5B?logo=ko-fi" alt="Ko-fi"></a>
</p>

## Contributing

Contributions welcome. Open an issue first so we can talk about what you have in mind.

## License

[MIT](LICENSE)
