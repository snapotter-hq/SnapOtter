# Lightweight Docker Image Without AI/ML Tools

**Date:** 2026-04-04
**Issue:** stirling-image/stirling-image#1
**Status:** Design approved

## Problem

The full Docker image is ~11 GB, mostly Python ML dependencies (rembg, RealESRGAN, PaddleOCR, MediaPipe, LaMa) and pre-downloaded model weights. Users on constrained hardware (Raspberry Pi, small VPS) or those who only need image processing tools are paying for size they don't use. First community feedback on r/selfhosted flagged this.

## Solution

Ship a `:lite` Docker tag that drops the Python sidecar and all ML dependencies. Keep every Sharp-based tool. Target size: 1-2 GB.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build strategy | Single Dockerfile, `ARG VARIANT=full` | One file to maintain. Avoids drift between two Dockerfiles. |
| Detection mechanism | Build-time `ENV STIRLING_VARIANT` | Explicit, instant, testable. No startup probing. |
| API behavior (lite) | AI routes return 501 | Clear signal vs confusing 404. Tells consumers what to do. |
| Frontend-API bridge | Extend `/v1/settings` response | Reuses existing fetch. Avoids extra endpoint complexity. |
| Frontend UX | Grey out AI tools + "AI" badge + toast on click | Users see what they're missing. Toast links to docs for upgrade path. |
| Tag naming | `:lite` / `:latest` (full) | "lite" = fewer features (accurate). "slim" = smaller OS base (misleading in Docker convention). |
| Feature scope | All Sharp tools stay, 5 Python tools dropped | Sharp tools add zero meaningful size. All savings come from Python. |
| Shared constants | `PYTHON_SIDECAR_TOOLS` in `packages/shared/` | Single source of truth for AI tool IDs across API and frontend. |

## Architecture

### Dockerfile (`docker/Dockerfile`)

A build arg controls the variant, defaulting to `full`:

```dockerfile
ARG VARIANT=full
```

In the production stage, the Python installation block (system packages, venv, pip installs, model downloads) is wrapped in a shell conditional:

```dockerfile
ARG VARIANT
RUN if [ "$VARIANT" = "full" ]; then \
  apt-get install -y python3 python3-pip python3-venv python3-dev \
    tesseract-ocr tesseract-ocr-deu tesseract-ocr-fra \
    tesseract-ocr-spa tesseract-ocr-chi-sim \
    build-essential libgl1 libglib2.0-0 && \
  python3 -m venv /opt/venv && \
  /opt/venv/bin/pip install ... && \
  python3 docker/download_models.py && \
  ... model downloads ... \
; fi
```

A runtime env var is set from the build arg:

```dockerfile
ENV STIRLING_VARIANT=${VARIANT}
```

Packages kept in both variants (used by Sharp-based tools): imagemagick, libraw-dev, potrace, libheif-examples, gosu.

Packages dropped in lite: python3, python3-pip, python3-venv, python3-dev, tesseract-ocr (+ language packs), build-essential, libgl1, libglib2.0-0.

Base image stays `node:22-bookworm` for both variants. Switching lite to `bookworm-slim` is a future optimization, not in scope for the first pass.

Building the lite image: `docker build --build-arg VARIANT=lite -t stirling-image:lite .`

### Shared Constants (`packages/shared/`)

A new constant in `packages/shared/src/constants.ts`:

```typescript
export const PYTHON_SIDECAR_TOOLS = [
  "remove-background",
  "upscale",
  "blur-faces",
  "erase-object",
  "ocr",
] as const;
```

This replaces the hardcoded `AI_PYTHON_TOOLS` set in `apps/web/src/hooks/use-tool-processor.ts` and is used by the API for route registration and settings response.

### API Changes (`apps/api/`)

**Route registration** (`apps/api/src/routes/tools/index.ts`):

When `STIRLING_VARIANT === "lite"`, the 5 AI tool routes are registered as lightweight stub handlers returning 501. The `@stirling-image/ai` package is not imported at all in lite mode (conditional import), avoiding any accidental Python spawn attempt.

```typescript
if (process.env.STIRLING_VARIANT !== "lite") {
  // Register actual AI tool routes (import @stirling-image/ai)
} else {
  // Register stub routes returning 501 for each PYTHON_SIDECAR_TOOLS entry
}
```

The 501 response:

```json
{
  "statusCode": 501,
  "error": "Not Available",
  "message": "This tool requires the full image. See docs at <link>"
}
```

**Settings endpoint** (`/v1/settings` response):

Two new fields, derived at startup from `process.env.STIRLING_VARIANT` and the shared constant. Not stored in the database.

```json
{
  "...existing settings...",
  "variant": "lite",
  "variantUnavailableTools": ["remove-background", "upscale", "blur-faces", "erase-object", "ocr"]
}
```

In `full` mode: `variant: "full"`, `variantUnavailableTools: []`.

### Frontend Changes (`apps/web/`)

**Settings state**: Variant info is fetched once via a shared Zustand store (or shared hook) so both `ToolPanel` and `HomePage` access it without duplicate requests.

**Tool rendering**: Tools listed in `variantUnavailableTools` are rendered greyed out with an "AI" badge. Clicking shows a toast: "This tool requires the full image" with a link to the docs page.

This is distinct from user-disabled tools (`disabledTools`), which are hidden entirely with no toast.

**`use-tool-processor.ts`**: Replaces the hardcoded `AI_PYTHON_TOOLS` set with the shared `PYTHON_SIDECAR_TOOLS` constant import.

### CI/CD Changes (`.github/workflows/release.yml`)

The Docker build job uses a matrix strategy:

```yaml
strategy:
  matrix:
    variant: [full, lite]
```

Tags published per variant:

| Variant | Tags |
|---------|------|
| full | `latest`, `1.6.0`, `1.6`, `1` |
| lite | `lite`, `1.6.0-lite`, `1.6-lite`, `1-lite` |

Both variants are multi-arch (`linux/amd64,linux/arm64`) and pushed to Docker Hub (`stirlingimage/stirling-image`) and GHCR (`ghcr.io/stirling-image/stirling-image`).

The CI workflow (`ci.yml`) also builds both variants as a smoke test (build only, no push).

### Documentation (`apps/docs/`)

A new docs page covering:

- What the lite image is and why it exists
- Which tools are included vs excluded (the 5 AI tools)
- Pull commands: `docker pull stirlingimage/stirling-image:lite`
- Docker Compose examples for both variants
- How to switch from lite to full when AI tools are needed

This is the page linked from the frontend toast and the 501 API response.

## Tools by Variant

### Included in lite (all Sharp-based, ~27 tools)

resize, crop, rotate, convert, compress, strip-metadata, color-adjustments, watermark-text, watermark-image, text-overlay, compose, info, compare, find-duplicates, color-palette, qr-generate, barcode-read, collage, split, border, svg-to-raster, vectorize, gif-tools, bulk-rename, favicon, image-to-pdf, replace-color, smart-crop

### Excluded from lite (Python sidecar required, 5 tools)

remove-background, upscale, blur-faces, erase-object, ocr

## Testing

- Build both variants in CI and verify they start successfully
- Verify lite image does not contain Python, pip, or model weights
- Verify AI routes return 501 in lite mode
- Verify frontend shows greyed-out AI tools with correct toast in lite mode
- Verify all Sharp-based tools work identically in both variants
- Verify lite image size is in the 1-2 GB target range
