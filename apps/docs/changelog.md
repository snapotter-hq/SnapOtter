---
description: Release notes and version history for SnapOtter. See what's new, improved, and fixed in each release.
---

# Changelog {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 turns the image toolkit into a full file-manipulation suite: 200+ tools across five modalities (Image, Video, Audio, PDF, and Files), rebuilt on Postgres 17 and a Redis-backed job queue, with a one-command `docker run`. This is a major release; read Breaking changes before upgrading from 1.x.

### New features {#new-features}

- **Four new tool modalities**: Video, Audio, PDF, and Files join Image, taking the catalog to 200+ tools.
- **Durable background jobs**: A Redis-backed queue (BullMQ) runs every tool as a tracked job with live SSE progress.
- **All-in-one single-container mode**: One `docker run` boots a complete instance with embedded Postgres and Redis.
- **On-demand AI bundles**: Background removal, OCR, transcription, upscaling, face detection and enhancement, object eraser, colorize, and photo restoration install from the UI. GPU acceleration is detected per framework.
- **Sign PDF**: Draw, type, or upload a signature and place it on a PDF in the browser.
- **Automate**: A visual pipeline builder that chains tools, with nine prebuilt templates.
- **83 one-click conversion presets**: Dedicated JPG-to-PNG, MP4-to-GIF, and similar converters with fuzzy search.
- **Layer-based image editor**: A Konva-powered editor at `/editor` with brushes, shapes, adjustments, filters, and curves.
- **Files library**: Save any result and reuse it as input to another tool.
- Pinned tools, in-canvas zoom and pan, 21 languages, and enterprise capabilities (OIDC/SSO, SAML, SCIM, S3 storage, per-tool permissions, audit export, distributed tracing).

### Improvements {#improvements}

- Cancel a running process. (#137)
- Full-resolution RAW decoding through LibRaw, including DNG. (#289)
- Non-root and foreign-UID deployments (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Accurate AI install detection and a hardened install flow. (#214, #352)
- Privacy hardening: no automatic third-party egress, plus an optional strict-offline mode.
- Always-on feedback button, even with analytics off.

### Bug fixes {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` disables rate limiting for tool routes again. (#271)
- Repaired AI virtualenv paths inside the Docker image. (#390)
- sharp 0.35.2+ compatibility. (#362)
- Image editor layout fixes: rulers, fill behavior, sidebar, and canvas sizing. (#258, #259)
- Completed the Italian translation. (#231, #206, #425)
- Audio normalize and loudnorm preserve the source sample rate.
- SSRF hardening: numeric IPv6 CIDR matching and a broadened URL pre-scan. (#287)
- Generated PDFs are stamped with SnapOtter as the Producer.
- mediapipe installs on Python 3.13 and Debian 13.

### Breaking changes {#breaking-changes}

2.0 replaces the embedded SQLite database with Postgres 17 and adds Redis 8 for the job queue. Your 1.x data migrates automatically on first boot, but the container stack changed, so back up your whole `/data` volume first (1.x runs SQLite in WAL mode, so the committed data usually lives in `snapotter.db-wal`). Then pick the single-container image (embedded Postgres and Redis, root only) or the Compose stack (app plus Postgres 17 and Redis 8). See the [migration guide](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) and the [upgrade guide](/guide/upgrading).

### Upgrade {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

New HTML to Image tool, WCAG 2.2 AA accessibility, security hardening from penetration testing, and 5 critical Docker fixes.

### New features {#new-features-1}

- **HTML to Image**: Capture screenshots of URLs or raw HTML as PNG/JPEG/WebP. Full-page captures, custom viewports, dark mode.
- **Docker _FILE secret convention**: Mount sensitive env vars as files instead of plain-text. (#205)
- **Enterprise licensing and S3 storage**: Optional commercial license key and S3-compatible object storage.
- **Shape editor improvements**: Fill/stroke transparency, RGBA color picker, dash line styles.
- **Pre-built release archives**: Download tarballs from GitHub Releases for non-Docker installs (Proxmox, bare metal, LXC). (#202)

### Improvements {#improvements-1}

- **WCAG 2.2 AA accessibility**: Skip navigation, focus trapping, aria-live regions, reduced motion support, correct contrast ratios. (#209)
- **Mobile responsiveness**: Responsive settings, SSE auto-reconnect on mobile tab switch. (#203, #204)
- **Background removal quality**: Edge smoothing, color decontamination, output format selection.
- **Italian translation**: ~145 new strings by @albanobattistella. (#206)
- **Per-tool API documentation**: 53 doc pages with parameters, examples, and response formats.
- **AI model downloads**: Retry logic with exponential backoff for HuggingFace. (#201)

### Bug fixes {#bug-fixes-1}

- Fresh Docker containers were completely unusable (rate limit blocked all requests).
- Face detection AI tools (blur-faces, red-eye-removal, enhance-faces, passport-photo) failed on all platforms.
- HEIC files broken on ARM (libheif symbol mismatch).
- Upscale and restore-photo AI bundles failed to install on ARM.
- OCR used wrong CUDA version on GPU containers.
- SSRF guard bypass via hex IPv4-mapped IPv6 addresses. (Credit: @tonghuaroot)
- iPhone HEIC decoding with auxiliary images. (#183, #199)
- Real-ESRGAN CUDA OOM on 8GB GPUs. (#200)
- 6 production Sentry errors and 7 QA bugs. (#208)

### Security {#security}

- 10 penetration test findings addressed (XFF bypass, malformed JSON crashes, unbounded pipelines, audit log XSS, TRACE method, and more). (#207)
- SSRF hex IPv6 bypass blocked. (Credit: @tonghuaroot)
- Dockerfile base images pinned by digest.

### Upgrade {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Live demo, per-tool landing pages, and a batch of polish fixes.

### New features {#new-features-2}

- **Live demo** - [demo.snapotter.com](https://demo.snapotter.com) lets people try SnapOtter without installing anything.
- **Tools index page** - Browse all 50+ tools at `/tools` with search and category filters.
- **50+ SEO landing pages** - Every tool now has a dedicated landing page with FAQs, use cases, and comparison tables.
- **Background preview** - Before-after slider shows a checkered background behind transparent images.
- **Strong password generator** - One-click button in the Add Members form.

### Bug fixes {#bug-fixes-2}

- HEIC/HEIF info tool no longer fails (pre-decode added).
- AI model bundle install shows better error messages and respects resource limits.
- Library thumbnails load correctly (auth headers were missing).
- Dropdown menus no longer clip in People and Teams settings tables.
- Size comparison percentage hidden on non-compression tools.
- Duplicate privacy policy link removed.
- Italian translation added for AI features settings.
- Renamed Lucide icons updated (Wand2, Columns).

### Infrastructure {#infrastructure}

- OpenSSF Scorecard hardened from 4.3 to ~7.0.
- CI tests parallelized into 4 shards with downsized fixtures.
- 41 dependency updates.

### Upgrade {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Five new tools, a full image editor, SSO login, 20 languages. Probably should have been three separate releases, but here we are.

### New features {#new-features-3}

- **Image editor** - Layers, brushes, shapes, adjustments, filters, curves, keyboard shortcuts. Runs in your browser, processes on your hardware.
- **OIDC / SSO authentication** - Login with Google, GitHub, Okta, or any OpenID Connect provider. Set a few env vars and your team uses their existing accounts.
- **Meme generator** - 100 built-in templates with text rendering via opentype.js. Or upload your own image.
- **Beautify** - Drop a screenshot in, get a polished image out. Device frames (macOS, Windows, browser), shadows, gradients, social media presets.
- **Color blindness simulation** - Preview how images look with protanopia, deuteranopia, tritanopia, and other color vision deficiencies.
- **PNG transparency fixer** - Detects fake-transparent PNGs and fixes them with BiRefNet HR-matting. Optional watermark removal via LaMa inpainting.
- **AI canvas expand** - Extend image boundaries with AI fill. Three quality tiers (fast, balanced, quality) depending on how much GPU time you want to trade.
- **20 languages** - Arabic, Chinese (Simplified/Traditional), Czech, Dutch, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Thai, Turkish, Ukrainian, Vietnamese. RTL works for Arabic.
- **URL import** - Paste URLs into the dropzone or bulk-import from a list. Server-side fetch with SSRF protection.
- **Multi-file eraser** - Draw erase masks across multiple images, process them all with one click. Strokes persist per-image.
- **Pipeline import/export** - Save tool chains as JSON, share them with others.
- **17 new camera RAW formats** via exiftool, plus QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ, and APNG input. New output codecs for BMP, ICO, JP2, QOI. AVIF, TIFF, GIF, JXL, and PSD export recovered from a previously lost branch.

### Improvements {#improvements-2}

- **Image enhancement** - Replaced the old pipeline with CLAHE + normalise + gamma. New Deep Enhance toggle uses the AI model for more aggressive results.
- **Restore photo** - Scratch detection rewritten with 8-angle Otsu filtering. LaMa inpainting now runs at native resolution.
- **Exotic formats everywhere** - OCR, image-to-PDF, favicon generator, composition, stitch, and vectorize all decode HEIC, RAW, PSD now.
- **Compress** - Target-size tolerance tightened from 5% to 1%. Target size is the default mode. Added stepper buttons and KB/MB unit selector.
- **Sentry cleanup** - 644 non-actionable events filtered. Real errors now handled properly.
- **GPU detection** - Better diagnostics for containers where CUDA is present but nvidia-smi is not.
- **Auth-disabled mode** - Anonymous user is seeded in the DB with admin role. API keys, pipelines, and user files no longer break on FK constraints.
- **2,705+ new tests** across unit, integration, and E2E.

### Bug fixes {#bug-fixes-3}

- Upscale on CPU no longer times out on NAS boxes and low-power hardware.
- QR code logo no longer makes the preview vanish permanently.
- Crop overflow fixed for tall portrait images.
- TIFF alpha files correctly force PNG output instead of producing corruption.
- HDR/EXR decode converts to 8-bit before CLAHE, fixing decode failures.
- Face landmarks input buffers converted to PNG before the Python sidecar, fixing crashes.
- Find duplicates handles mixed-format batches and network errors.
- Beautify preview updates in real time.
- Progress bars for stitch and vectorize.
- SVGZ handled by SVG-to-raster.
- Non-ASCII filenames fixed via percent-encoded X-File-Results header.

### Upgrade {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Or with Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Unified Docker image with GPU auto-detection. One image handles both CPU and GPU workloads. Simplified compose to a single file with log rotation. Model pre-downloads now include verification and a smoke test.

---

## v1.13.0 {#v1-13-0}

Role-based access control (RBAC). 14 granular permissions, three built-in roles (admin, editor, user), custom role support. Permission checks on all API routes. Frontend tabs filtered by user permissions.

---

## v1.12.0 {#v1-12-0}

PDF to Image tool. Convert PDF pages to PNG, JPEG, WebP, or TIFF at custom DPI. Unified Docker image with GPU auto-detection.

---

## v1.11.0 {#v1-11-0}

Auto-generated llms.txt via vitepress-plugin-llms for AI-friendly documentation.

---

## v1.10.0 {#v1-10-0}

Content-aware resize (seam carving) with face protection. Resize images while preserving important content.

---

## v1.9.0 {#v1-9-0}

Stitch / Combine tool. Join images side by side, stacked vertically, or in a custom grid.

---

## v1.8.0 {#v1-8-0}

Edit Metadata tool. View and edit EXIF, IPTC, and XMP metadata with a granular strip/keep interface.

---

## Older releases {#older-releases}

For the full commit-level changelog including patch releases, see [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
