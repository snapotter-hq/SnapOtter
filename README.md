<p align="center">
  <img src="branding/social-preview.png" width="800" alt="SnapOtter - A Self-Hosted File Manipulation Suite">
</p>

> [!NOTE]
> **SnapOtter v2.0.0 is coming soon.** The current Docker image (`latest`) is v1.x and includes image tools only. v2.0 adds 240 tools across image, video, audio, documents, and files. We're fixing a last-minute issue with local AI installs before publishing the new image. Stay tuned!

<p align="center">
  <a href="https://hub.docker.com/r/snapotter/snapotter"><img src="https://img.shields.io/docker/v/snapotter/snapotter?label=Docker%20Hub&logo=docker" alt="Docker Hub"></a>
  <a href="https://github.com/orgs/snapotter-hq/packages/container/package/snapotter"><img src="https://img.shields.io/badge/GHCR-ghcr.io%2Fsnapotter--hq%2Fsnapotter-blue?logo=github" alt="GHCR"></a>
  <a href="https://github.com/snapotter-hq/snapotter/actions"><img src="https://img.shields.io/github/actions/workflow/status/snapotter-hq/snapotter/ci.yml?label=CI" alt="CI"></a>
  <a href="https://www.bestpractices.dev/projects/12881"><img src="https://www.bestpractices.dev/projects/12881/badge" alt="OpenSSF Best Practices"></a>
  <a href="https://github.com/snapotter-hq/snapotter/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPLv3-blue" alt="License"></a>
  <a href="https://github.com/snapotter-hq/snapotter/stargazers"><img src="https://img.shields.io/github/stars/snapotter-hq/snapotter?style=social" alt="Stars"></a>
  <a href="https://snapotter.com"><img src="https://img.shields.io/badge/Website-snapotter.com-blue?logo=googlechrome&logoColor=white" alt="Website"></a>
  <a href="https://demo.snapotter.com"><img src="https://img.shields.io/badge/Live%20Demo-Try%20it-blue?logo=googlechrome&logoColor=white" alt="Live Demo"></a>
  <a href="https://discord.gg/hr3s7HPUsr"><img src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/sponsors/snapotter-hq"><img src="https://img.shields.io/badge/Sponsor-pink?logo=githubsponsors&logoColor=white" alt="Sponsor"></a>
</p>

<p align="center">
  <strong>Self-hosted file toolkit. 240 tools across image, video, audio, PDF, and files.</strong><br />
  The open-source alternative to Smallpdf, iLovePDF, TinyPNG, CloudConvert, and Otter.ai, in one stack you host yourself.
</p>

![SnapOtter - Dashboard](branding/dashboard.gif)

Stirling-PDF stops at PDFs. ConvertX stops at conversions. SnapOtter runs all five, and your files never leave your server. Edit images, convert video, transcribe audio, repair PDFs, batch your files: one Docker stack, on hardware you own.

## Key Features

- **240 tools across 5 modalities:**
  - **Image (105):** resize, crop, compress, convert, watermark, color adjust, beautify screenshots, generate memes, vectorize, GIF tools, find duplicates, passport photos, plus dedicated format converters (JPG to PNG, HEIC to JPG, WebP to PNG, image to PDF, and more). Supports 55+ input formats (including 23 camera RAW formats) and 14 output formats
  - **Video (57):** convert, compress, trim, resize, crop, merge, video-to-GIF, extract audio, stabilize, change FPS, burn/extract subtitles, plus dedicated converters (MOV to MP4, MKV to MP4, MP4 to MP3, and more)
  - **Audio (27):** convert, trim, normalize, volume, fade, pitch shift, silence removal, noise reduction, merge/split, waveform, plus dedicated converters (M4A to MP3, AAC to MP3, OGG to WAV, and more)
  - **Documents / PDF (28):** merge, split, compress, convert (Word/Excel/PowerPoint/EPUB), protect/unlock, redact, watermark, page numbers, OCR, plus PDF to JPG/PNG/TIFF
  - **Files (23):** CSV/JSON/XML/YAML conversion, CSV merge/split, Excel to CSV, chart maker, ZIP create/extract
- **Image editor:** Layer-based editor with brushes, shapes, adjustments, filters, curves, and keyboard shortcuts. Runs in your browser, processes on your hardware
- **Local AI:** Remove backgrounds, upscale images, restore and colorize old photos, erase objects, blur faces, enhance faces, extract text (OCR from images and PDFs), transcribe audio, auto-generate video subtitles, expand canvas, and fix transparency. All on your hardware, no internet required
- **OIDC / SSO:** Login with Google, GitHub, Okta, or any OpenID Connect provider
- **21 languages:** English, Arabic, Chinese (Simplified & Traditional), Dutch, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Swedish, Thai, Turkish, Ukrainian, Vietnamese. RTL support for Arabic
- **Pipelines:** Chain tools into reusable workflows with unlimited steps. Import/export as JSON. Batch process unlimited files at once
- **REST API:** Every tool available via API with API key auth. Interactive docs at `/api/docs`
- **Self-hosted stack:** SnapOtter + Postgres 17 + Redis 8, run together with one `docker compose up`. No external SaaS dependencies
- **Multi-arch:** Runs on AMD64 and ARM64 (Intel, Apple Silicon, Raspberry Pi)
- **Privacy first:** Your files never leave your network. Basic analytics help us catch bugs and improve tools -- disable anytime by rebuilding with `SNAPOTTER_ANALYTICS=off` ([Here's how to do it](https://docs.snapotter.com/guide/deployment.html#analytics))

## Quick Start

SnapOtter runs as a small Docker Compose stack (app + Postgres 17 + Redis 8). Save this as `compose.yaml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports: ["1349:1349"]
    environment:
      DATABASE_URL: postgres://snapotter:snapotter@postgres:5432/snapotter
      REDIS_URL: redis://redis:6379
    volumes:
      - snapotter-data:/data
    depends_on: [postgres, redis]
    restart: unless-stopped
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes: ["snapotter-pgdata:/var/lib/postgresql/data"]
    restart: unless-stopped
  redis:
    image: redis:8-alpine
    volumes: ["snapotter-redisdata:/data"]
    restart: unless-stopped
volumes:
  snapotter-data:
  snapotter-pgdata:
  snapotter-redisdata:
```

Then start the stack:

```bash
docker compose up -d
```

<details>
<summary><sub>Have an NVIDIA GPU? Click here for GPU acceleration.</sub></summary>
<br>

Use the GPU Compose file for GPU-accelerated background removal, upscaling, transcription, and OCR. See [Docker Tags](https://docs.snapotter.com/guide/docker-tags) for the GPU Compose example and benchmarks.

</details>

**Default credentials:**

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

You will be asked to change your password on first login.

For Docker Compose, persistent storage, and other setup options, see the [Getting Started Guide](https://docs.snapotter.com/guide/getting-started). For GPU acceleration and tag details, see [Docker Tags](https://docs.snapotter.com/guide/docker-tags).

## Documentation

- [Getting Started](https://docs.snapotter.com/guide/getting-started)
- [Configuration](https://docs.snapotter.com/guide/configuration)
- [OIDC / SSO](https://docs.snapotter.com/guide/oidc)
- [Deployment](https://docs.snapotter.com/guide/deployment)
- [Supported Formats](https://docs.snapotter.com/guide/supported-formats)
- [Docker Tags](https://docs.snapotter.com/guide/docker-tags)
- [REST API](https://docs.snapotter.com/api/rest)
- [AI Engine](https://docs.snapotter.com/api/ai)
- [Image Engine](https://docs.snapotter.com/api/image-engine)
- [Architecture](https://docs.snapotter.com/guide/architecture)
- [Database](https://docs.snapotter.com/guide/database)
- [Developer Guide](https://docs.snapotter.com/guide/developer)
- [Contributing](https://docs.snapotter.com/guide/contributing)
- [Translation Guide](https://docs.snapotter.com/guide/translations)

## Contributing

We welcome bug reports, feature ideas, and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, or jump in:

- [Open an issue](https://github.com/snapotter-hq/snapotter/issues)
- [Submit a PR](CONTRIBUTING.md#code-requires-cla)
- [Join Discord](https://discord.gg/hr3s7HPUsr) for help and discussion
- [Sponsor the project](https://github.com/sponsors/snapotter-hq) to keep SnapOtter free for everyone

## Support SnapOtter

SnapOtter is built and maintained independently with no venture capital or corporate backing. Sponsorships fund infrastructure, keep releases flowing, and ensure the project stays free and open for everyone.

If SnapOtter saves you from paying for cloud file-processing services, consider supporting its development:

<a href="https://github.com/sponsors/snapotter-hq">
  <img src="branding/sponsor-banner.svg" width="100%" alt="Sponsor SnapOtter on GitHub">
</a>

<!-- sponsors -->
<!-- sponsors -->

<p align="center">
  <a href="https://star-history.com/#snapotter-hq/SnapOtter&Date">
    <img src="https://api.star-history.com/svg?repos=snapotter-hq/SnapOtter&type=Date&theme=dark" alt="Star History Chart">
  </a>
</p>

## License

This project is dual-licensed under the [AGPLv3](LICENSE) and a commercial license.

- **AGPLv3 (free):** You may use, modify, and distribute this software under the AGPLv3. If you run a modified version as a network service, you must make your source code available under the AGPLv3.
- **Commercial license (paid):** For use in proprietary software or SaaS products where AGPLv3 source-disclosure is not suitable, a commercial license is available. [Contact us](mailto:contact@snapotter.com) for pricing and terms.

See [LICENSING.md](LICENSING.md) for full details on the open-core boundary between AGPLv3 and commercial code.
