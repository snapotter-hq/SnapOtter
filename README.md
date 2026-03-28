<p align="center">
  <img src="apps/web/public/logo-192.png" width="80" alt="Stirling Image logo">
</p>

<h1 align="center">Stirling Image</h1>

<p align="center">Stirling-PDF but for images. 30+ tools and local AI in a single Docker container.</p>

<p align="center">
  <a href="https://hub.docker.com/r/siddharth123sk/stirling-image"><img src="https://img.shields.io/badge/Docker-Hub-blue?logo=docker" alt="Docker"></a>
  <a href="https://github.com/siddharthksah/Stirling-Image/actions"><img src="https://img.shields.io/github/actions/workflow/status/siddharthksah/Stirling-Image/ci.yml?label=CI" alt="CI"></a>
  <a href="https://github.com/siddharthksah/Stirling-Image/blob/main/LICENSE"><img src="https://img.shields.io/github/license/siddharthksah/Stirling-Image" alt="License"></a>
  <a href="https://github.com/siddharthksah/Stirling-Image/stargazers"><img src="https://img.shields.io/github/stars/siddharthksah/Stirling-Image?style=social" alt="Stars"></a>
</p>

![Stirling Image - Dashboard](images/dashboard.png)

## Key Features

- **30+ image tools** - Resize, crop, compress, convert, watermark, color adjust, and more
- **Local AI** - Remove backgrounds, upscale images, erase objects, blur faces, extract text (OCR). All running on your hardware with pre-downloaded models, no internet required
- **Pipelines** - Chain tools into reusable workflows. Batch process up to 200 images at once
- **REST API** - Every tool available via API. Interactive docs included at `/api/docs`
- **Single container** - One `docker run`, no Redis, no Postgres, no external services
- **Multi-arch** - Runs on AMD64 and ARM64 (Intel, Apple Silicon, Raspberry Pi)
- **Your data stays yours** - No telemetry, no tracking, no external calls. Images never leave your machine

## Quick Start

```bash
docker run -d -p 1349:1349 -v stirling-data:/data siddharth123sk/stirling-image:latest
```

Open http://localhost:1349 in your browser.

**Default credentials:**

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

You will be asked to change your password on first login. This is enforced for all new accounts and cannot be skipped in production.

For Docker Compose, persistent storage, and other setup options, see the [Getting Started Guide](https://siddharthksah.github.io/Stirling-Image/guide/getting-started).

## Documentation

- [Getting Started](https://siddharthksah.github.io/Stirling-Image/guide/getting-started)
- [Configuration](https://siddharthksah.github.io/Stirling-Image/guide/configuration)
- [REST API](https://siddharthksah.github.io/Stirling-Image/api/rest)
- [Architecture](https://siddharthksah.github.io/Stirling-Image/guide/architecture)
- [Developer Guide](https://siddharthksah.github.io/Stirling-Image/guide/developer)
- [Translation Guide](https://siddharthksah.github.io/Stirling-Image/guide/translations)

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, the [Developer Guide](https://siddharthksah.github.io/Stirling-Image/guide/developer) for setup, and the [Translation Guide](https://siddharthksah.github.io/Stirling-Image/guide/translations) for adding languages.

## Support

Bug reports and feature requests: [GitHub Issues](https://github.com/siddharthksah/Stirling-Image/issues)

<p align="center">
  <a href="https://github.com/sponsors/siddharthksah"><img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github-sponsors" alt="GitHub Sponsors"></a>
  <a href="https://ko-fi.com/siddharthksah"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Ko--fi-FF5E5B?logo=ko-fi" alt="Ko-fi"></a>
</p>

## License

[MIT](LICENSE)
