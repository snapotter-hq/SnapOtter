# SnapOtter

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

A free, self-hosted toolbox for images, videos, audio, and PDFs. Run it on your own computer or server, and your files stay there.

[Try the live demo](https://demo.snapotter.com) · [Documentation](https://docs.snapotter.com/guide/getting-started)

![SnapOtter dashboard](branding/dashboard.gif)

## Install

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it.
2. Run this in a terminal:

   ```bash
   docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
   ```

3. Open [http://localhost:1349](http://localhost:1349) and log in with `admin` / `admin`. You'll be asked to set a new password.

For Docker Compose, production setups, and GPU acceleration, see the [deployment guide](https://docs.snapotter.com/guide/deployment).

## What it does

200+ tools for images, video, audio, PDFs, and data files. A few examples:

- Shrink a 20 MB photo for email
- Turn a screen recording into a GIF
- Merge a folder of PDFs into one file
- Transcribe a voice memo
- Convert a spreadsheet to CSV

Chain tools into pipelines, process files in batches, or call everything through the REST API.

## Privacy

Your files stay on the machine you run SnapOtter on. Basic analytics are on by default to help us find bugs. You can turn them off in the admin settings. [Details](https://docs.snapotter.com/guide/telemetry).

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
<p align="center">
  SnapOtter is free and open source, made possible by the people below.
</p>

<p align="center">
  <a href="https://github.com/kkwpsi"><img src="https://github.com/kkwpsi.png?size=72" width="72" height="72" alt="Karol"></a>
  <a href="https://github.com/highb"><img src="https://github.com/highb.png?size=72" width="72" height="72" alt="Brandon High"></a>
  <a href="https://github.com/CSP-Tom"><img src="https://github.com/CSP-Tom.png?size=72" width="72" height="72" alt="Tom"></a>
  <a href="https://github.com/dominic427"><img src="https://github.com/dominic427.png?size=72" width="72" height="72" alt="Dominic Lopez"></a>
</p>

<p align="center">
  <a href="https://github.com/kkwpsi">@kkwpsi</a> &nbsp;&middot;&nbsp; <a href="https://github.com/highb">@highb</a> &nbsp;&middot;&nbsp; <a href="https://github.com/CSP-Tom">@CSP-Tom</a> &nbsp;&middot;&nbsp; <a href="https://github.com/dominic427">@dominic427</a>
</p>
<!-- sponsors -->

<p align="center">
  <a href="https://github.com/snapotter-hq/SnapOtter/stargazers">
    <img src="https://raw.githubusercontent.com/snapotter-hq/SnapOtter/star-history/star-history.svg" width="760" alt="SnapOtter star history chart">
  </a>
</p>

## License

This project is dual-licensed under the [AGPLv3](LICENSE) and a commercial license.

- **AGPLv3 (free):** You may use, modify, and distribute this software under the AGPLv3. If you run a modified version as a network service, you must make your source code available under the AGPLv3.
- **Commercial license (paid):** For use in proprietary software or SaaS products where AGPLv3 source-disclosure is not suitable, a commercial license is available. [Contact us](mailto:contact@snapotter.com) for pricing and terms.

See [LICENSING.md](LICENSING.md) for full details on the open-core boundary between AGPLv3 and commercial code.
