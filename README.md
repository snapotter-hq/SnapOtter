<p align="center">
  <img src="branding/social-preview.png" width="800" alt="SnapOtter - A Self-Hosted File Manipulation Suite">
</p>

<!-- TEMP: 2.0.0 launch + migration + Discord note. Trim a few weeks after release, once it's old news. -->
> [!IMPORTANT]
> **SnapOtter 2.0 is here.** 200+ tools across five modalities (image, video, audio, PDF, and files), durable background jobs, on-demand local AI, and a one-command `docker run`. See the [release notes](https://github.com/snapotter-hq/SnapOtter/releases/tag/v2.0.0).
>
> **Coming from 1.x?** Many of you have trusted SnapOtter since day one, and your feedback and suggestions shaped everything that followed. 2.0 is a big step, and we worked to make sure it doesn't break what you already depend on. Your accounts, saved files, settings, API keys, and pipelines carry over automatically on first boot, and your old database is never modified. We wrote a full [migration guide](./MIGRATING.md) so the move is safe and boring.
>
> I'll be on [Discord](https://discord.gg/hr3s7HPUsr) more than usual this week, so if you need a hand with the upgrade or anything else, come say hi and I'll get back to you quickly. Thank you for being here.

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
  <strong>Open-source, self-hosted file-processing infrastructure. Convert, compress, OCR, transcribe, strip metadata, and run local AI across image, video, audio, PDF, and documents, through a UI, REST API, and pipelines. Your files never leave your network.</strong>
  <br /><br />
  The one self-hosted stack that replaces CloudConvert, Smallpdf, TinyPNG, TinyWow, and Otter.ai. 200+ tools across five modalities, on hardware you own.
</p>

![SnapOtter - Dashboard](branding/dashboard.gif)

Stirling-PDF stops at PDFs. ConvertX stops at conversions. SnapOtter runs all five, and your files never leave your server. Edit images, convert video, transcribe audio, repair PDFs, batch your files: one Docker stack, on hardware you own.

## Quick Start

One command, that's it.

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Open [http://localhost:1349](http://localhost:1349) and log in with `admin` / `admin`. That's the whole install.

For the production Compose stack, NVIDIA GPU acceleration, and configuration, see [Deployment](#deployment) below.

## Key Features

- **200+ tools across 5 modalities:**
  - **Image (105):** resize, crop, compress, convert, watermark, color adjust, beautify screenshots, generate memes, vectorize, GIF tools, find duplicates, passport photos, plus dedicated format converters (JPG to PNG, HEIC to JPG, WebP to PNG, image to PDF, and more). Supports 55+ input formats (including 23 camera RAW formats) and 14 output formats
  - **Video (57):** convert, compress, trim, resize, crop, merge, video-to-GIF, extract audio, stabilize, change FPS, burn/extract subtitles, plus dedicated converters (MOV to MP4, MKV to MP4, MP4 to MP3, and more)
  - **Audio (27):** convert, trim, normalize, volume, fade, pitch shift, silence removal, noise reduction, merge/split, waveform, plus dedicated converters (M4A to MP3, AAC to MP3, OGG to WAV, and more)
  - **PDF (29):** merge, split, compress, convert, protect/unlock, redact, sign, watermark, page numbers, OCR, plus PDF to JPG/PNG/TIFF
  - **Files (23):** CSV/JSON/XML/YAML conversion, CSV merge/split, Excel to CSV, chart maker, ZIP create/extract
- **Image editor:** Free layer-based editor with brushes, shapes, adjustments, filters, curves, and keyboard shortcuts. Runs in your browser and processes on your hardware
- **Local AI:** Remove backgrounds, upscale images, restore and colorize old photos, erase objects, blur faces, enhance faces, extract text (OCR from images and PDFs), transcribe audio, auto-generate video subtitles, expand canvas, and fix transparency. All on your hardware, no internet required. Built-in Fast OCR adds about 25 MiB to the official image; the optional accuracy pack installs on demand
- **OIDC / SSO:** Login with Google, GitHub, Okta, or any OpenID Connect provider
- **21 languages:** English, Arabic, Chinese (Simplified & Traditional), Dutch, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Swedish, Thai, Turkish, Ukrainian, Vietnamese. RTL support for Arabic
- **Pipelines:** Chain tools into reusable workflows with 20 steps by default. Import/export as JSON. Batch process up to 100 files by default
- **REST API:** Every tool available via API with API key auth. Interactive docs at `/api/docs`
- **Self-hosted:** one `docker run` for a single-container quick start (embedded Postgres 17 + Redis 8), or the same Postgres 17 + Redis 8 as a Compose stack for production. No external SaaS dependencies
- **Multi-arch:** Runs on AMD64 and ARM64 (Intel, Apple Silicon, Raspberry Pi)
- **Privacy first:** Your files never leave your network. Basic analytics help us catch bugs and improve tools -- disable at build time with `SNAPOTTER_ANALYTICS=off` or at runtime with the in-app admin opt-out ([Here's how to do it](https://docs.snapotter.com/guide/deployment.html#analytics))

## Deployment

The [Quick Start](#quick-start) one-liner above is all most people need. For production, run the 3-container Compose stack (app + Postgres 17 + Redis 8). Save this as `compose.yaml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports: ["1349:1349"]
    environment:
      DATABASE_URL: postgres://snapotter:snapotter@postgres:5432/snapotter
      REDIS_URL: redis://redis:6379
    volumes:
      - SnapOtter-data:/data
    depends_on: [postgres, redis]
    restart: unless-stopped
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes: ["SnapOtter-pgdata:/var/lib/postgresql/data"]
    restart: unless-stopped
  redis:
    image: redis:8-alpine
    volumes: ["SnapOtter-redisdata:/data"]
    restart: unless-stopped
volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Then start the stack:

```bash
docker compose up -d
```

<details>
<summary><sub>Have an NVIDIA GPU? Click here for CUDA acceleration.</sub></summary>
<br>

Use the GPU Compose file for NVIDIA CUDA-accelerated background removal, upscaling, and transcription. OCR deliberately uses the same portable CPU runtime on CPU-only and NVIDIA hosts. Intel/AMD iGPU acceleration through VA-API, Quick Sync, or OpenCL is not supported for AI inference today; those systems run AI tools on CPU. See [Docker Tags](https://docs.snapotter.com/guide/docker-tags) for the GPU Compose example and benchmarks.

</details>

**Default credentials:**

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

You will be asked to change your password on first login.

For Docker Compose, persistent storage, and other setup options, see the [Getting Started Guide](https://docs.snapotter.com/guide/getting-started). For NVIDIA CUDA acceleration and tag details, see [Docker Tags](https://docs.snapotter.com/guide/docker-tags).

## Documentation

- [Getting Started](https://docs.snapotter.com/guide/getting-started)
- [Upgrading from 1.x to 2.0](https://docs.snapotter.com/guide/upgrading)
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

If SnapOtter has replaced a paid subscription or two in your workflow, a small sponsorship helps keep it that way:

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
