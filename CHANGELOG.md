# [0.8.0](https://github.com/siddharthksah/Stirling-Image/compare/v0.7.0...v0.8.0) (2026-03-25)


### Bug Fixes

* **docker:** skip husky prepare script in production install ([fdfb0a0](https://github.com/siddharthksah/Stirling-Image/commit/fdfb0a0e7412c86e3b85a70daf5093f44c34ee99))
* prevent useAuth infinite loop causing rate limit storms ([9624dae](https://github.com/siddharthksah/Stirling-Image/commit/9624dae1569b6f2ad52ce990fc84eca809b849a8))


### Features

* **api:** add logo upload/serve/delete routes with tests ([6063f4d](https://github.com/siddharthksah/Stirling-Image/commit/6063f4daa98acf3f03e004a588de562e377105c7))
* **api:** add persistent file management helpers to frontend api module ([ecbfcce](https://github.com/siddharthksah/Stirling-Image/commit/ecbfcceec82010fa44244c6839928b9930d59b5a))
* **api:** add teams CRUD routes and update auth team references ([ec22e53](https://github.com/siddharthksah/Stirling-Image/commit/ec22e53a3b15ae030743e76db0d57584000727b6))
* **api:** add tool filtering and DB-backed cleanup settings ([07e7e8d](https://github.com/siddharthksah/Stirling-Image/commit/07e7e8d58d311d89f43cee1c7fa21dd0eb4c9dfb))
* **api:** add user files CRUD routes at /api/v1/files/* ([6a07007](https://github.com/siddharthksah/Stirling-Image/commit/6a070071456611d2bf2acf4a474be8c43680e1b0))
* **db:** add teams table and migration ([365783b](https://github.com/siddharthksah/Stirling-Image/commit/365783b6dc1f5cfa631bb4f6915fcf99d91f574d))
* **db:** add userFiles table and migration ([a2fdbd5](https://github.com/siddharthksah/Stirling-Image/commit/a2fdbd5fef2cf02f90692166d6386c5ac21c2cef))
* **env:** add FILES_STORAGE_PATH config variable ([3c737a6](https://github.com/siddharthksah/Stirling-Image/commit/3c737a6c724f4862d302bf22a75ebcd745f0df4c))
* **files:** add Files page with nav, list, details, upload, and routing ([3f127a4](https://github.com/siddharthksah/Stirling-Image/commit/3f127a457e8a7a07d22fdf8776c3166092db562f))
* **files:** add mobile layout for Files page ([e864d1e](https://github.com/siddharthksah/Stirling-Image/commit/e864d1e430bd516ccbe1732ec7451e1e7d670177))
* **files:** wire serverFileId for version tracking ([8868d3e](https://github.com/siddharthksah/Stirling-Image/commit/8868d3e556beedcff35de268e72241e7f10998a3))
* **i18n:** add translation keys for settings phase 1 ([c5ff80a](https://github.com/siddharthksah/Stirling-Image/commit/c5ff80acfbe18b953cfd96a88498fc70b82b541e))
* implement Files page with persistent storage and version tracking ([f6183d2](https://github.com/siddharthksah/Stirling-Image/commit/f6183d2c62e6ad04dec3fe0250468cbfd6cbc035))
* **storage:** add file storage helpers module ([7c37213](https://github.com/siddharthksah/Stirling-Image/commit/7c372135c8eb9d65198c0720bc2d0c83ac145004))
* **stores:** add Zustand store for Files page state management ([fb487be](https://github.com/siddharthksah/Stirling-Image/commit/fb487be051c6da6ca22a443323cf4788d4ca4e6b))
* **tool-factory:** auto-save results to persistent file store when fileId provided ([27d8629](https://github.com/siddharthksah/Stirling-Image/commit/27d8629c704bc9cabed8c7dd87c34ea8e9433347))
* **ui:** add teams, tools, feature flags, temp files, logo to settings dialog ([fbce0dd](https://github.com/siddharthksah/Stirling-Image/commit/fbce0dddd05c1e539bfbdb084c3b53d59f5dfd76))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Files page — persistent server-side storage with version tracking and a mobile layout
- Teams — full CRUD API, database table, and migration
- Admin settings panel covering teams, tool visibility, feature flags, temp file cleanup, and logo upload
- Branding API routes (logo upload, serve, delete)
- Tool filtering and DB-backed cleanup settings on the API side
- i18n keys for the new settings screens
- `userFiles` table for persistent file management
- `FILES_STORAGE_PATH` config variable for controlling where uploaded files live
- Tool results auto-save to persistent storage when a `fileId` is provided

### Changed

- Renamed `Tool.alpha` to `Tool.experimental` everywhere
- Tightened TypeScript types in tool-factory registry (removed `any` casts)
- Bumped login attempt limit from 5 to 10
- Switched `isNaN` to `Number.isNaN` in cleanup interval parsing
- Null-safe team lookup in auth registration

### Removed

- Internal planning docs (`docs/superpowers/`) and Claude Code config (`.claude/`) from version control — these stay local only

## [0.7.0] - 2026-03-24

### Added

- Inline settings configuration for pipeline automation steps, allowing per-step parameter overrides

### Security

- Hardened authentication with stricter session validation
- Added security headers (HSTS, CSP, X-Content-Type-Options)
- SVG sanitization on upload to prevent XSS via malicious SVGs
- Pipeline ownership enforcement — users can only execute their own pipelines

## [0.6.0] - 2026-03-24

### Added

- Extracted reusable auto-orient utility from image processing pipeline
- Expanded integration test coverage across tool routes

## [0.5.2] - 2026-03-23

### Fixed

- Restored `APP_VERSION` import used by the `/health` endpoint, fixing version reporting in production

## [0.5.1] - 2026-03-23

### Fixed

- Crop tool now uses `percentCrop` from `onChange` callback, fixing inflated pixel values that produced incorrect crop regions

### Changed

- Removed unused Swagger dependencies, reducing bundle size
- Parallelized CI jobs for faster pipeline execution

## [0.5.0] - 2026-03-23

### Added

- **Interactive crop tool** with visual overlay, grid lines, aspect ratio presets, pixel input fields, and keyboard controls
- **Multi-image support** — upload and process multiple files with arrow navigation and filmstrip thumbnail strip
- Batch processing wired across all tool settings with `processAllFiles` method
- `clientJobId` correlation for SSE progress during batch operations
- Side-by-side comparison view for resize results
- Live CSS transform preview for rotate/flip operations
- Redesigned resize settings with tabbed UI (presets, custom dimensions, scale percentage)
- Client-side ZIP extraction via `fflate` for batch result downloads
- Per-file metadata display with caching

### Fixed

- White screen crash when uploading photos with null GPS EXIF data
- TypeScript `Uint8Array` type incompatibility with `fflate`

## [0.4.1] - 2026-03-23

### Fixed

- Unified all services on port 1349 (was split across multiple ports)
- Strip-metadata tool now correctly removes all EXIF data
- Before/after slider and side-by-side comparison component rendering fixes

## [0.4.0] - 2026-03-23

### Added

- **Resize tool redesign** with tabbed settings UI — presets, custom dimensions, and scale percentage
- **Rotate/flip live preview** using CSS transforms before server round-trip
- Side-by-side comparison component for visual before/after on resize
- Conditional result views — side-by-side for resize, live preview for rotate

### Fixed

- CI/CD pipeline — removed broken AI docs updater workflow, fixed Docker publish job

## [0.3.1] - 2026-03-23

### Fixed

- CI workflow failure: `tsx` binary not found in AI docs updater action

## [0.3.0] - 2026-03-23

### Added

- **Real progress bars** replacing indeterminate spinners across all tools
- SSE-based progress streaming from Python AI scripts through the API to the frontend
- `ProgressCard` component with determinate progress display for all tool types
- `useToolProcessor` hook rewritten with XHR upload progress and SSE event streaming
- `onProgress` callback support in all AI wrapper functions (rembg, RealESRGAN, PaddleOCR, MediaPipe, LaMa)
- `emit_progress()` calls in all Python AI scripts for granular status updates
- Intuitive subject/quality selector replacing raw model dropdown in background removal tool

### Fixed

- Progress bar no longer resets from 100% to 0% between processing stages
- `setError(null)` no longer overrides `setProcessing(true)` race condition
- SSE progress endpoint added to public auth paths (was returning 401)

## [0.2.1] - 2026-03-22

### Added

- **Monorepo foundation** — Turborepo with pnpm workspaces (`apps/api`, `apps/web`, `apps/docs`, `packages/shared`, `packages/image-engine`, `packages/ai`)
- **Fastify API server** with health check, environment config, and SQLite database via Drizzle ORM
- **Authentication system** with default admin user, login page, and session management
- **React SPA** with Vite, Tailwind CSS, dark/light/system theme, and sidebar layout
- **14 Sharp-based image operations** — resize, crop, rotate, convert, compress, metadata strip, color adjust, and more
- **Generic tool route factory** for declarative API endpoint creation
- **Tool settings UI** for all core image tools with before/after comparison slider
- **Batch processing** with ZIP download and SSE progress tracking
- **30+ tools** including watermark, text overlay, composition, collage, splitting, border/frame, image info, compare, duplicates, color palette, QR code, barcode, replace-color, SVG-to-raster, vectorize, GIF, favicon, and image-to-PDF
- **6 AI-powered tools** via Python sidecar — background removal, upscaling, OCR, face detection/blur, object erasure (LaMa inpainting)
- **Pipeline system** — builder UI with templates, execution/save/list API endpoints
- i18n architecture with English translations
- Keyboard shortcuts for tool navigation
- Mobile responsive layout with bottom navigation
- Fullscreen tool grid view
- Settings dialog (general, security, API keys, about)
- API key management routes
- Home page redesign with upload flow and auth guard
- Multi-stage Docker build with Python ML dependencies
- Playwright end-to-end test suite
- VitePress documentation site with GitHub Pages deployment
- GitHub Actions CI pipeline and Docker Hub auto-publish workflow
- Semantic-release for automated versioning
- Swagger/OpenAPI documentation at `/api/docs`
- Automatic workspace file cleanup cron

### Fixed

- Python bridge ENOENT handling for venv fallback — no longer swallows script errors
- Port configuration unified to 1349 for the UI across all modes
- Home upload flow, auth redirect, and form submit handling bugs
- Background removal defaults to U2-Net (fast, ~2s) instead of slow BiRefNet

[Unreleased]: https://github.com/siddharthksah/Stirling-Image/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/siddharthksah/Stirling-Image/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/siddharthksah/Stirling-Image/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/siddharthksah/Stirling-Image/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/siddharthksah/Stirling-Image/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/siddharthksah/Stirling-Image/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/siddharthksah/Stirling-Image/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/siddharthksah/Stirling-Image/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/siddharthksah/Stirling-Image/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/siddharthksah/Stirling-Image/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/siddharthksah/Stirling-Image/releases/tag/v0.2.1
