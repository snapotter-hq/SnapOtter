# SnapOtter Test Suite

## Directory Structure

```
tests/
  unit/                    # Vitest unit tests (~185 files)
    ai/                    # AI sidecar bridge + bundle tests
    api/                   # API route/config/middleware tests
    doc-engine/            # doc-engine package tests
    features/              # Feature flag + enterprise tests
    fixtures/              # Fixture guard tests (resolve/budget/manifest)
    image-engine/          # image-engine operation tests
    media-engine/          # media-engine FFmpeg wrapper tests
    security/              # Security-focused unit tests
    shared/                # Shared constants/i18n/permissions tests
    web/                   # React component tests (tsx)
  integration/             # Full-API integration tests (~250 files)
    fixtures/              # Fixture integrity tests (decode through Sharp/ffprobe/qpdf)
    generated/             # Generated test matrices (format x tool, pairwise settings)
    platform/              # Platform tests (jobs, pipelines, batch, auth, OIDC)
    security/              # Security integration tests (SSRF, XXE, path traversal)
    tools/                 # Per-tool integration tests
  e2e/                     # Playwright specs (main app, Chromium primary)
  e2e-analytics/           # Analytics flow e2e specs
  e2e-docker/              # Docker container e2e specs
  e2e-docs/                # VitePress docs site e2e specs
  e2e-editor/              # Konva image editor e2e specs
  e2e-landing/             # Astro landing site e2e specs
  fixtures/                # Shared test fixtures (see below)
  helpers/                 # Test utilities (pairwise, zod-pict, tool defaults)
  setup/                   # Vitest setup (per-fork DB clone, BullMQ prefix isolation)
  baseline/                # Phase 0 baseline snapshots for parity verification
  benchmark/               # Performance benchmarks
  qa/                      # QA checklists and manual test plans
```

## Fixtures

Fixtures live in `tests/fixtures/` in a modality-first layout:

```
tests/fixtures/
  index.ts              # Typed registry -- import paths from here, not raw strings
  manifest.json         # sha256 + bytes + provenance for all valid/ assets
  gen-manifest.mjs      # Re-stamps manifest hashes from disk
  gen-synthetic-content.mjs  # Regenerates CC0 synthetic content (QR, barcode, OCR, etc.)
  LICENSES.md           # Provenance audit trail
  image/
    valid/              # Real images for depth tests (portraits, scenes, OCR, etc.)
    formats/            # Tier-1 tiny format samples (sample.png, sample.arw, ...)
    edge/               # Edge-case images (1x1, blank, extreme aspect)
    hostile/            # Malformed/bomb/polyglot files for rejection tests
  video/
    valid/              # Real videos (Big Buck Bunny CC-BY heroes, TTS speech)
    formats/            # Tier-1 tiny format samples (tiny.mp4, tiny.webm, ...)
    hostile/            # Truncated/malformed video files
  audio/
    valid/              # Real audio (TTS speech in 6 formats, tagged MP3)
    formats/            # Tier-1 tiny format samples (tiny.mp3, tiny.wav, ...)
    hostile/            # Zero-byte/malformed audio files
  document/
    valid/              # PDFs (3-page, 6-page, encrypted, OCR-scanned)
    formats/            # Tier-1 tiny doc samples (tiny.docx, tiny.epub, ...)
    edge/               # Edge-case docs (remote-img.html for SSRF tests)
    hostile/            # Truncated/garbage documents
  data/
    valid/              # Data files (CSV, JSON, XML, YAML, TSV, ZIP)
  security/             # XXE/SSRF test vectors (SVG)
```

### Two-Tier Fixture Strategy

**Tier-1: Tiny Synthetics** (in `formats/`, `edge/`, `hostile/`)
Small, project-generated files for format-compatibility matrices and fast unit tests.
These are always-regeneratable by the generator scripts and are used for breadth.

**Tier-2: Real Heroes** (in `valid/`)
Content-representative files for integration and fidelity tests. Includes:
- Big Buck Bunny video clips (CC-BY, Blender Foundation)
- macOS TTS speech in 6 audio formats (CC0)
- Project-generated synthetics (QR codes, barcodes, OCR text images, PDFs)
- Portrait/scene photos for AI tool tests (some UNVERIFIED-REVIEW, see manifest)

Every `valid/` file is tracked in `manifest.json` with sha256 hash, byte count,
source URL, and license. The manifest guard test (`fixture-manifest.test.ts`)
verifies disk matches manifest on every run.

### Typed Fixture Registry

Always import fixture paths from `tests/fixtures/index.ts`:

```ts
import { fixtures, readFixture, fixtureDir } from "../../fixtures/index.js";

// Named paths (type-checked, IDE autocomplete)
const pngPath = fixtures.image.base.png200;
const heroMp4 = fixtures.video.hero.mp4;

// Read file bytes
const buffer = readFixture(fixtures.image.base.png200);

// Format accessor (for matrix iteration)
const arwPath = fixtures.image.formats("arw");
const mp4Path = fixtures.video.tiny("mp4");

// Directory paths (for glob/scan patterns)
const hostileDir = fixtureDir.image.hostile;
```

### Guard Tests

Four guard tests protect fixture integrity:

| Guard | Location | What it checks |
|-------|----------|----------------|
| fixture-resolve | `unit/fixtures/` | Every registry path exists and is non-empty |
| fixture-budget | `unit/fixtures/` | Per-extension size caps prevent bloat |
| fixture-manifest | `unit/fixtures/` | sha256/bytes in manifest.json match disk |
| fixture-integrity | `integration/fixtures/` | Real heroes decode through Sharp/ffprobe/qpdf |

Additional parity guards:

| Guard | Location | What it checks |
|-------|----------|----------------|
| tool-registry-drift | `unit/shared/` | Frontend registry matches shared TOOLS catalog |
| tool-route-drift | `integration/` | API routes match shared TOOLS catalog |
| i18n-completeness | `unit/shared/` | All 21 locales have all required keys |

### Adding a Fixture

1. Add the file to the appropriate modality directory (`image/valid/`, `video/formats/`, etc.)
2. Add a named key in `tests/fixtures/index.ts`
3. Run `node tests/fixtures/gen-manifest.mjs` (for `valid/` files)
4. Fill in `sourceUrl` and `license` in `manifest.json`
5. Update `LICENSES.md` if the file has third-party origin
6. Run guards: `pnpm vitest run tests/unit/fixtures/`

## Generator Scripts

Three generators produce deterministic synthetics. All are idempotent and skip
files that already exist (to avoid breaking manifest hashes from encoder-version
differences). Pass `--force` to `gen-synthetic-content.mjs` to overwrite.

| Script | Scope | Outputs |
|--------|-------|---------|
| `scripts/generate-test-fixtures.mjs` | Tier-1 format samples | `video/formats/tiny.mp4`, `audio/formats/tiny.{mp3,wav}`, `document/formats/tiny.{docx,xlsx,epub,html,md}`, `document/valid/encrypted.pdf` |
| `scripts/generate-hostile-fixtures.mjs` | Hostile inputs | `image/hostile/{truncated.jpg,zero-byte.png,garbage.jpg,png-bytes.jpg,bomb-50000x50000.png}` |
| `tests/fixtures/gen-synthetic-content.mjs` | CC0 synthetics | QR codes, barcodes, OCR text images, PDFs, SVG logo, multi-face placeholder, animated GIF, tagged MP3, metadata MP4 |

The generators do NOT touch committed real heroes (BBB videos, TTS speech, UNVERIFIED-REVIEW photos).

## Running Tests

```bash
# Full suite
pnpm test                    # All unit + integration tests
pnpm test:unit               # Unit tests only
pnpm test:integration        # Integration tests only

# Single file
pnpm vitest run tests/unit/my-test.test.ts
pnpm vitest run tests/integration/my-test.test.ts

# Fixture guards only
pnpm vitest run tests/unit/fixtures

# E2E (Playwright)
pnpm test:e2e                # Main app (chromium + serial + visual projects)
pnpm test:e2e:landing        # Landing site
pnpm test:e2e:docs           # VitePress docs
pnpm test:e2e:analytics      # Analytics flows
pnpm test:docker             # Full Docker container test

# Editor e2e (no root alias)
pnpm playwright test --config playwright.editor.config.ts

# Single e2e spec
pnpm playwright test tests/e2e/my-test.spec.ts
```

### Environment Requirements

Unit and integration tests need Postgres + Redis:

```bash
docker compose -f docker-compose.dev.yml up -d
export DATA_DIR=/tmp/so-test-data && mkdir -p "$DATA_DIR"
```

Each Vitest fork gets its own Postgres DB clone + workspace + isolated `BULLMQ_PREFIX`
via `tests/setup/per-fork-env.ts` (testcontainers for Postgres). 30s test timeouts.

### E2E Projects

The main Playwright config defines three projects:

- **chromium**: Parallel-safe specs, 2 workers (override via `PW_WORKERS`)
- **chromium-serial**: Global-state specs, 1 worker
- **chromium-visual**: Screenshot comparison specs (platform-suffixed baselines)

Auth setup project logs in and saves storage state. The `webServer` block spins up
both dev servers with a fresh test DB.

### Environment Switches

| Variable | Effect |
|----------|--------|
| `FULL_MATRIX=1` | Run all format x tool combinations (nightly) |
| `FUZZ=1` + `FUZZ_RUNS=N` | Property-based fuzz testing (nightly) |
| `PW_WORKERS=N` | Override Playwright worker count |

### CI Pipeline

PRs run: lint, typecheck, unit, integration (4 shards), e2e smoke.
Nightly: full e2e, cross-browser, docker suite, full matrix + fuzz, coverage.
