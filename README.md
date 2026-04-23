<p align="center">
  <img src="social-preview.png" width="800" alt="ashim — A Self Hosted Image Manipulator">
</p>

<p align="center">
  <a href="https://hub.docker.com/r/ashimhq/ashim"><img src="https://img.shields.io/docker/v/ashimhq/ashim?label=Docker%20Hub&logo=docker" alt="Docker Hub"></a>
  <a href="https://github.com/orgs/ashim-hq/packages/container/package/ashim"><img src="https://img.shields.io/badge/GHCR-ghcr.io%2Fashim--hq%2Fashim-blue?logo=github" alt="GHCR"></a>
  <a href="https://github.com/ashim-hq/ashim/actions"><img src="https://img.shields.io/github/actions/workflow/status/ashim-hq/ashim/ci.yml?label=CI" alt="CI"></a>
  <a href="https://github.com/ashim-hq/ashim/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPLv3-blue" alt="License"></a>
  <a href="https://github.com/ashim-hq/ashim/stargazers"><img src="https://img.shields.io/github/stars/ashim-hq/ashim?style=social" alt="Stars"></a>
</p>

![ashim - Dashboard](images/dashboard.png)

## Key Features

- **45+ image tools** - Resize, crop, compress, convert, watermark, color adjust, vectorize, create GIFs, find duplicates, generate passport photos, and more
- **Local AI** - Remove backgrounds, upscale images, restore and colorize old photos, erase objects, blur faces, enhance faces, extract text (OCR). All on your hardware - no internet required
- **Pipelines** - Chain tools into reusable workflows. Batch process up to 200 images at once
- **REST API** - Every tool available via API with API key auth. Interactive docs at `/api/docs`
- **Single container** - One `docker run`, no Redis, no Postgres, no external services
- **Multi-arch** - Runs on AMD64 and ARM64 (Intel, Apple Silicon, Raspberry Pi)
- **Privacy first** - Your images never leave your machine. ashim asks once whether you'd like to share anonymous product analytics (which tools are used, errors encountered — never file data). Change anytime in Settings, or set `ANALYTICS_ENABLED=false` to disable completely

## Quick Start

```bash
docker run -d --name ashim -p 1349:1349 -v ashim-data:/data ghcr.io/ashim-hq/ashim:latest
```
Open http://localhost:1349 in your browser.

<details>
<summary><sub>Have an NVIDIA GPU? Click here for GPU acceleration.</sub></summary>
<br>

Add `--gpus all` for GPU-accelerated background removal, upscaling, and OCR:

```bash
docker run -d --name ashim -p 1349:1349 --gpus all -v ashim-data:/data ghcr.io/ashim-hq/ashim:latest
```

> Requires an NVIDIA GPU and [Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Falls back to CPU if no GPU is found. See [Docker Tags](https://ashim-hq.github.io/ashim/guide/docker-tags) for benchmarks and Docker Compose examples.

</details>

**Default credentials:**

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

You will be asked to change your password on first login.

For Docker Compose, persistent storage, and other setup options, see the [Getting Started Guide](https://ashim-hq.github.io/ashim/guide/getting-started). For GPU acceleration and tag details, see [Docker Tags](https://ashim-hq.github.io/ashim/guide/docker-tags).

## Documentation

- [Getting Started](https://ashim-hq.github.io/ashim/guide/getting-started)
- [Configuration](https://ashim-hq.github.io/ashim/guide/configuration)
- [Deployment](https://ashim-hq.github.io/ashim/guide/deployment)
- [Docker Tags](https://ashim-hq.github.io/ashim/guide/docker-tags)
- [REST API](https://ashim-hq.github.io/ashim/api/rest)
- [AI Engine](https://ashim-hq.github.io/ashim/api/ai)
- [Image Engine](https://ashim-hq.github.io/ashim/api/image-engine)
- [Architecture](https://ashim-hq.github.io/ashim/guide/architecture)
- [Database](https://ashim-hq.github.io/ashim/guide/database)
- [Developer Guide](https://ashim-hq.github.io/ashim/guide/developer)
- [Contributing](https://ashim-hq.github.io/ashim/guide/contributing)
- [Translation Guide](https://ashim-hq.github.io/ashim/guide/translations)

## Feedback

Found a bug or have a feature idea? Open a [GitHub Issue](https://github.com/ashim-hq/ashim/issues). We don't accept pull requests, but your feedback directly shapes the project. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is dual-licensed under the [AGPLv3](LICENSE) and a commercial license.

- **AGPLv3 (free):** You may use, modify, and distribute this software under the AGPLv3. If you run a modified version as a network service, you must make your source code available under the AGPLv3. This applies to personal use, open-source projects, and any use that complies with AGPLv3 terms.
- **Commercial license (paid):** For use in proprietary software or SaaS products where AGPLv3 source-disclosure is not suitable, a commercial license is available. [Contact us](mailto:ashim.hq@gmail.com) for pricing and terms.
