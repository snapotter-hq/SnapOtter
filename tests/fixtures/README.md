# Test Fixtures

Shared test fixtures for the SnapOtter test suite. Organized by modality in two tiers.

## Two-Tier Structure

**Tier 1: Tiny Synthetics (matrices/format coverage)**
Small, project-generated files for format-compatibility matrices and fast unit tests.
Located in `*/formats/`, `*/edge/`, `*/hostile/`, and `security/`.

**Tier 2: Real Heroes (depth/fidelity testing)**
Larger, content-representative files for integration and fidelity tests.
Located in `*/valid/`. Each must be tracked in `manifest.json` with sha256 + provenance.

## Modality-First Layout

```
tests/fixtures/
  index.ts            # Typed registry (import paths from here, not raw strings)
  manifest.json       # sha256 + bytes + provenance for all valid/ assets
  gen-manifest.mjs    # Script to re-stamp manifest hashes
  gen-synthetic-content.mjs  # Regenerate CC0 synthetics (QR, barcode, OCR, etc.)
  LICENSES.md         # Provenance audit trail
  image/
    valid/            # Base test images, portraits, OCR, barcodes, QR codes
    formats/          # 35 format samples (sample.png, sample.arw, sample.psd, ...)
    edge/             # Edge cases (1x1, blank, extreme aspect, fake transparency)
    hostile/          # Truncated, zero-byte, garbage, bomb, extension-mismatch
  video/
    valid/            # BBB heroes (mov/webm/mkv/avi), TTS speech, metadata MP4
    formats/          # tiny.{mp4,webm,avi,...}, subtitle files (srt/vtt/ass)
    hostile/          # Truncated MP4
  audio/
    valid/            # TTS speech (wav/flac/ogg/m4a/aac/opus), tagged MP3
    formats/          # tiny.{mp3,wav,flac,...}, tone-stereo, tone-gap
    hostile/          # Zero-byte WAV
  document/
    valid/            # PDFs (3-page, 6-page, encrypted, OCR-scanned)
    formats/          # tiny.{docx,xlsx,epub,html,md}
    edge/             # remote-img.html (SSRF test vector)
    hostile/          # Truncated DOCX, garbage PDF
  data/
    valid/            # tiny.{csv,json,xml,yaml,tsv,zip}
  security/           # SVG XXE test vectors (file-read, SSRF)
```

## Using the Registry

Always import paths from `tests/fixtures/index.ts` rather than hard-coding paths:

```ts
import { fixtures, readFixture } from "../../fixtures/index.js";

// Direct path access
const pngPath = fixtures.image.base.png200;

// Read bytes
const buffer = readFixture(fixtures.image.base.png200);

// Format accessor (for matrix iteration)
const arwPath = fixtures.image.formats("arw");
const mp4Path = fixtures.video.tiny("mp4");
```

## Adding a Fixture

1. Add the file to the appropriate modality directory
2. Add a key in `tests/fixtures/index.ts` pointing to it
3. Run `node tests/fixtures/gen-manifest.mjs` (for `valid/` files)
4. Fill in `sourceUrl` and `license` in `manifest.json` (required)
5. Update `LICENSES.md` with the provenance record
6. Run the guards: `pnpm vitest run tests/unit/fixtures/`

## Licensing Gate

Every `valid/` hero must have a verified license (CC0, CC-BY, CC-BY-SA, or
public-domain). Assets with `UNVERIFIED-REVIEW` need license review before
release. The manifest guard test reports the current count.

## Guard Tests

Four guard tests protect fixture integrity:

- **fixture-resolve** (unit): every registry path exists and is non-empty
- **fixture-budget** (unit): per-extension size caps prevent bloat
- **fixture-manifest** (unit): sha256/bytes in manifest.json match disk
- **fixture-integrity** (integration): real heroes decode through Sharp/ffprobe/qpdf

## Generator Scripts

Three generators produce deterministic synthetics. All are idempotent and skip
existing files to avoid breaking manifest hashes. See `tests/README.md` for details.
