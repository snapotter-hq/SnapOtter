---
description: Release notes and version history for SnapOtter. See what's new, improved, and fixed in each release.
---

# Changelog {#changelog}

## v2.2.0 {#v2-2-0}

Most of 2.2 is hardening. A non-admin holding a delegated `users:manage` role could take over an instance, and every tool endpoint turned out to be missing its permission check. Upgrade if you run more than one user.

The rest is the long tail of self-hosting: downloads that started and never finished, presets that broke the moment you added a second file, containers that crash-looped while Postgres was still coming up. Two new tools landed too. Docs and the website are now translated into 21 languages, and the interface finally clears WCAG AA contrast.

> [!IMPORTANT]
> If you granted `users:manage` to a non-admin through a custom role, that role could take over administrator accounts on 2.0.0 through 2.1.0. Details in Security.

### Security {#v2-2-0-security}

- **Privilege escalation through a delegated `users:manage` role (GHSA-9xgh-95qh-2x7h).** A non-admin holding `users:manage` through a custom role could reset the password of, or delete, a higher-privileged account, a built-in administrator included, and take over the instance. Password reset and account deletion now verify the caller's authority over the target, so a delegated role cannot reach above its own level. Affected: 2.0.0 through 2.1.0. Reported by 李春来 (Chunlai Li). (#616)
- **Every tool endpoint is now gated.** Tool access was enforced route by route, so all 45 hand-written routes had to remember the same call and none of them did. A role without `tools:use` could still run image-to-pdf, erase-object, upscale, sign-pdf and the rest. The check now lives in one preHandler keyed off the matched route, so it covers sub-paths and any route added later. (#646)
- **Rate limiting was bypassable on Docker installs.** The image shipped `TRUST_PROXY=true`, so the client IP came from a request header and a forged `X-Forwarded-For` walked past the login limiter. The default is now a private-network trust list. (#649)
- **Settings writes are checked per setting**, not once at the door, and config import is now transactional so a rejected key cannot leave half a config applied. (#618)
- **Library filenames cannot escape their storage root.** A crafted stored name, which a malicious 1.x SQLite import copies verbatim, could read or delete files outside the files directory. Only reachable after an operator imports an attacker-supplied 1.x SQLite database, which is the one path that lets a stored name be chosen. Reported by @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Job cancellation enforces ownership**, so an authenticated user can no longer cancel another user's job by its id. Reported by @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **A re-audit of the whole 2.0 tree caught what was still open**: a captured SAML assertion could be replayed, an MFA challenge survived any number of wrong codes, the per-request API-key lookup was a full table scan, `MAX_WORKSPACE_SIZE_GB` was dead config, and the SVG sanitizer let through unquoted `javascript:` hrefs. (#620)
- **Nine disclosed CVEs patched**: fast-uri, svgo, sharp and tar transitively (#619), plus Pillow 12.3.0 (#517). RAW decoding on arm64 now builds LibRaw 0.22.2 from source instead of linking an unpatched system copy. (#649)

### New Features {#v2-2-0-new-features}

- **Rounded Crop**: rounded-square and iOS-style squircle masks, with a corner-radius control. Built for favicons and app icons. (#602)
- **Remove GIF Background**: strip the background from an animated GIF, WebP or APNG frame by frame and get a transparent animation back. (#502)
- **Object Eraser lasso and High Quality mode**: drag a freeform loop instead of painting every pixel, and optionally install a diffusion inpainting bundle for cleaner large-area fills. (#503, #566)
- **Save as new, or overwrite.** Editing a library file used to silently supersede the original. You now choose per edit, and the default keeps it. (#564, #577)
- **Aspect-ratio presets in Resize.** Pick 1:1, 4:3 or 16:9 and the two dimensions stay locked, without upscaling. (#530)
- **Two-tier OCR**: a fast tier is baked into the image and runs offline with no download, and a more accurate runtime installs on demand. (#519)
- **Type anywhere to search.** Start typing on the dashboard or the homepage and it lands in the search box. (#644)
- **Documentation and website in 21 languages**: the docs site, the landing pages and the API reference are all translated now, joining the app interface. A new low-resource deployment guide covers Raspberry Pi and 2 GB machines. (#548)
- **Clearer tool names**: 18 ambiguous names now self-qualify, so "Compress" became "Compress Image". Tool ids and routes are unchanged, so nothing bookmarked breaks. (#520)

### Improvements {#v2-2-0-improvements}

- **WCAG AA contrast across the interface**: the palette was retuned so vivid orange stays on fills while text and labels use accessible ink tokens, and all 57 focus indicators now clear the 3:1 non-text bar. (#567, #574)
- **Upscale and background removal stop looking frozen**: the progress bar advances during inference instead of parking at 30%, and both tools now warn that a CPU-only host is much slower. (#605, #608)
- **Timeout messages name the real cause** and account for CPU-only hosts instead of blaming the upload. (#596)
- **SnapOtter waits for Postgres and Redis at startup** instead of crash-looping, in Compose and the all-in-one image alike. A Proxmox LXC install was restarting 76 times before this. (#537, #595)
- **Downloads survive a reverse proxy**: SnapOtter asks nginx and compatible proxies not to buffer file responses, which is the usual reason a self-hosted download starts and never finishes. (#604, #607)
- **Compress PDF lands near the target size**, and says so honestly when a target is out of reach. (#522)
- **Mobile tool controls stay reachable** now that the app shells size to the dynamic viewport. (#559)
- **Convert Audio exposes a sample-rate setting.** (#561)
- **Admins can relax the minimum password length**, down to 1 for a trusted LAN instance. (#543)
- **MFA is self-service**, the policy lockout is closed, and OIDC or SAML logins get a real MFA challenge instead of a hard block. (#531, #536)
- **A bare `Error: Error` now names its cause.** Sharp encode failures, AI sidecar exits, non-JSON document sidecar output, and background-removal failures all used to arrive with the reason scrubbed off. (#532, #534, #535, #538, #612)
- **The help dialog is translated.** Its shortcut labels and getting-started text were hardcoded English while finished translations sat unused in all 21 locale files. (#647)

### Bug Fixes {#v2-2-0-bug-fixes}

- **iPhone HEIC files were rejected** as unreadable before they reached the decoder that handles them. (#631)
- **Conversion presets failed on a second file**: jpg-to-pdf and its image-to-pdf siblings, plus pdf-to-png, pdf-to-jpg and pdf-to-tiff, all returned `Tool not found` once you uploaded two files. (#633, #643)
- **PDF conversion presets lost their download button.** (#629)
- **An unlimited processing timeout was not honored**, and stalled progress streams now recover instead of leaving the interface waiting. (#638)
- **Downloads hung instead of failing** when a stored file turned out shorter than its recorded length. (#617)
- **PDF page tools failed on short and encrypted files**: Remove Pages defaulted to a page range no document under six pages has, and password-protected PDFs failed cryptically inside the worker. (#594)
- **PDF to Text silently returned an empty file** for scanned PDFs. It now points you at OCR and serves text as UTF-8. (#603)
- **PDF to Word dropped colored text blocks** and split them across the page. (#500)
- **Object Eraser left ghost remnants** and blurred small objects in high-resolution images. (#501)
- **Stabilize Video wrote unplayable output** without faststart. (#593)
- **Image editor repairs**: rotate, flip, resize, levels, curves, filters and layer lock. (#597)
- **Sign PDF showed a blank canvas** instead of reporting why a PDF failed to load. (#545)
- **The file library recorded 0x0 dimensions** and skipped previews for HEIC, RAW and PSD uploads. (#636, #637)
- **Installing more than one AI bundle** left the shared virtualenv multi-versioned and quietly broke three tools. (#649)
- **Converting to JXL at quality 1 through 4 returned a 500**, and a missing ffmpeg was reported to you as a corrupt upload. (#649)
- **A transient Postgres outage stranded finished jobs**, leaving output on disk with no row pointing at it. A reconciler now adopts that work instead of dropping it. (#649)
- **A Redis endpoint that changed address wedged every consumer** while health checks still answered 200. (#649)
- **Website and docs fixes**: localized links no longer drop `#` fragments or lowercase `zh-CN`, the docs nav stays inside the viewport on tablets, and neither site calls the GitHub API from your browser any more. (#516, #562, #570, #560)

### Upgrade Notes {#v2-2-0-upgrade-notes}

Nothing to migrate, but two shipped defaults changed:

- **`TRUST_PROXY` now defaults to `loopback,linklocal,uniquelocal`** instead of trusting every peer. Docker bridge and Compose networks sit inside that range, so most setups need no change. If your reverse proxy reaches SnapOtter from a public address, set `TRUST_PROXY` explicitly, or rate limiting and audit logs will attribute every request to the proxy.
- **`MAX_AI_JOBS_PER_USER` defaults to 5** in-flight single-file AI jobs per user. Batch and pipeline AI runs stay uncapped.

New optional knobs: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (off by default) and `GIF_BG_MAX_FRAMES`.

### Acknowledgements {#v2-2-0-acknowledgements}

A good part of this release started as someone else's bug report.

Code and contributions:

- **@mvanhorn** ❤️: Rewrote the remove-background timeout failure into a message that says what to do about it, instead of a bare timeout. (#518, #494)
- **@EuanTop** ❤️: Restored the download action on PDF conversion preset pages by making the synchronous route return the standard tool-result contract. (#629, #623)
- **@harshjainnn** ❤️: Diagnosed the download that starts and never finishes, and proposed the socket-reset direction the fix was built on. (#617, #590)

Security disclosures:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Privately disclosed the privilege escalation through a delegated `users:manage` role, with a full source-to-sink analysis and a working exploit chain. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Disclosed an authenticated IDOR on job cancellation, and a path traversal in library stored filenames reachable after a malicious 1.x SQLite import, with a working proof of concept for each. (#599, #600)

Bug reports:

- **@riz467** ❤️: Real iPhone HEIC files rejected at validation, with the root cause worked out in the report. (#622)
- **@coupej** ❤️: PDF preset pages hanging forever, and jpg-to-pdf failing as soon as a second file was added. Two distinct bugs, correctly separated. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documented as unlimited but capped at five minutes. (#630)
- **@bezibaerchen** ❤️: Convert Audio hid the sample-rate setting its own description promised. (#558)
- **@hell-toupee** ❤️: The accurate OCR bundle failing to install with a `libpaddle` error. (#505)
- **@Michael1260** ❤️ and **@And-CSH** ❤️: Confirmed that OCR install failure independently and established that manual extraction works while the in-app installer does not, which pinned the bug to the installer. (#505)
- **@TomErnst1972** ❤️: Enabling the MFA-required policy locking an admin out of their own instance. (#515)
- **@thokich** ❤️: Object erasing producing blurry, unusable fills, which drove both the HD inpainting rewrite and the optional high-quality bundle. (#141)
- **@Hennie-git** ❤️: A Proxmox LXC install restarting 76 times against a Postgres that was not yet accepting connections. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Triaged that report in real time and produced the diagnosis the startup fix was built on. (#537)

Feature requests and feedback:

- **@LECOQQ** ❤️: Asked to relax password complexity on a home-server install. (#136)
- **@killervette42** ❤️: Asked for an Unraid Community App, now published to the Unraid CA store. (#96)
- **@alienatedsec** ❤️: Pointed out the GPU-falls-back-to-CPU fix was buried in a closed issue and undiscoverable, which is why it is in the deployment docs now. (#490, #587)
- **@neilp316** ❤️: Confirmed the Blackwell GPU failure on an RTX 5060 and mapped a working CUDA 12.8 upgrade path. (#120)
- **@Roiki11** ❤️: Argued for shared storage with path references over HTTP file transfer for off-box AI compute. (#189)

Thank you as well to the community members who reported these over Discord and email, whose names we did not record: the squircle crop request (#602), the image-to-PDF download that started and never finished (#604, #607), the Delete Pages tool getting stuck (#594), Arabic text missing from pdf-to-text (#603), and the diagnosis behind the ONNX GPU fallback (#490).

[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
