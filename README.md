<p align="center">
  <img src="branding/social-preview.png" width="800" alt="SnapOtter - A Self-Hosted File Manipulation Suite">
</p>

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

![SnapOtter - Dashboard](branding/dashboard.png)

## Key Features

- **157 tools across 5 modalities:** Image, video, audio, PDF, and data. Resize/crop/convert/compress images, trim & transcode video, edit & convert audio, merge/split/compress/OCR PDFs, and convert CSV/JSON/XML/YAML and archives. Images alone support 55+ input formats (including 23 camera RAW formats) and many output formats
- **Image editor:** Layer-based editor with brushes, shapes, adjustments, filters, curves, and keyboard shortcuts. Runs in your browser, processes on your hardware
- **Local AI (19 tools):** Remove backgrounds, upscale, restore and colorize old photos, erase objects, blur and enhance faces, extract text (OCR and OCR-PDF), expand canvas, transcribe audio, and auto-generate subtitles. All on your hardware, no internet required
- **OIDC / SSO:** Login with Google, GitHub, Okta, or any OpenID Connect provider
- **21 languages:** English, Arabic, Chinese (Simplified & Traditional), Dutch, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese (Brazil), Russian, Spanish, Swedish, Thai, Turkish, Ukrainian, Vietnamese. RTL support for Arabic
- **Pipelines & batch:** Chain tools into reusable workflows (import/export as JSON) and batch-process many files at once
- **REST API:** Every tool available via API with API key auth. Interactive docs at `/api/docs`
- **Self-hosted stack:** Runs as a small Docker Compose stack (app + Postgres + Redis). Multi-arch: AMD64 and ARM64 (Intel, Apple Silicon, Raspberry Pi)
- **Privacy first:** Your files never leave your network. SnapOtter asks once whether you'd like to share anonymous product analytics (which tools are used, errors encountered, never file data). Change anytime in Settings, or set `ANALYTICS_ENABLED=false` to disable completely

## Quick Start

SnapOtter runs as a small Docker Compose stack (app + Postgres 17 + Redis 8). Save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports: ["1349:1349"]
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin            # change on first login
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    volumes: ["snapotter-data:/data"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped
  postgres:
    image: postgres:17-alpine
    environment: { POSTGRES_USER: snapotter, POSTGRES_PASSWORD: snapotter, POSTGRES_DB: snapotter }
    volumes: ["snapotter-pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U snapotter"], interval: 10s, retries: 12 }
    restart: unless-stopped
  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes: ["snapotter-redisdata:/data"]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 10s, retries: 12 }
    restart: unless-stopped
volumes:
  snapotter-data:
  snapotter-pgdata:
  snapotter-redisdata:
```

<details>
<summary><sub>Have an NVIDIA GPU? Click here for GPU acceleration.</sub></summary>
<br>

For GPU-accelerated background removal, upscaling, and OCR, use the GPU Compose file (it adds NVIDIA GPU reservations to the `snapotter` service):

```bash
docker compose -f docker-compose-gpu.yml up -d
```

> Requires an NVIDIA GPU and [Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Falls back to CPU if no GPU is found. See [Docker Tags](https://docs.snapotter.com/guide/docker-tags) for the full GPU example and benchmarks.

</details>

**Default credentials:**

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

You will be asked to change your password on first login.

For persistent storage, secrets, OIDC/SSO, upgrading from 1.x, and other setup options, see the [Getting Started Guide](https://docs.snapotter.com/guide/getting-started). For GPU acceleration and tag details, see [Docker Tags](https://docs.snapotter.com/guide/docker-tags).

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

If SnapOtter saves you from paying for cloud image services, consider supporting its development:

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
