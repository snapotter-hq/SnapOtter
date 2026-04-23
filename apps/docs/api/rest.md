# REST API Reference

Interactive API docs with request/response examples are available at [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Machine-readable specs:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 spec
- `/llms.txt` - LLM-friendly summary
- `/llms-full.txt` - Complete LLM-friendly docs

## Authentication

All endpoints require authentication unless `AUTH_ENABLED=false`.

### Session Token

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/resize \
  -H "Authorization: Bearer <session-token>"
```

Sessions expire after 7 days (configurable via `SESSION_DURATION_HOURS`).

### API Keys

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Keys are prefixed `si_` and stored as SHA-256 hashes - the raw key is shown once and never retrievable again.

### Auth Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Login, get session token |
| `POST` | `/api/auth/logout` | Auth | Destroy current session |
| `GET` | `/api/auth/session` | Auth | Validate current session |
| `POST` | `/api/auth/change-password` | Auth | Change own password (invalidates all other sessions + API keys) |
| `GET` | `/api/auth/users` | Admin | List all users |
| `POST` | `/api/auth/register` | Admin | Create a new user |
| `PUT` | `/api/auth/users/:id` | Admin | Update user role or team |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Reset user's password |
| `DELETE` | `/api/auth/users/:id` | Admin | Delete a user |

### Permissions

| Permission | Admin | User |
|-----------|:-----:|:----:|
| Use tools | ✓ | ✓ |
| Own files/pipelines/API keys | ✓ | ✓ |
| See all users' files/pipelines/keys | ✓ | - |
| Write settings | ✓ | - |
| Manage users & teams | ✓ | - |
| Manage branding | ✓ | - |

## Health Check

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Public | Basic health check. Returns `{"status":"healthy","version":"..."}` with 200, or `{"status":"unhealthy"}` with 503 if the database is unreachable. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Detailed diagnostics including uptime, storage mode, database status, queue state, and GPU availability. |

## Using Tools

Every tool follows the same pattern:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

- Upload is `multipart/form-data`.
- `settings` is a JSON string with tool-specific options.
- Response is the processed file directly (or a ZIP for batch).
- Progress is tracked via SSE (see [Progress Tracking](#progress-tracking)).

## Tools Reference

### Essentials

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `resize` | Resize | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 social media presets |
| `crop` | Crop | `left`, `top`, `width`, `height`, `aspectRatio`, `shape` (rectangle/circle/rounded) |
| `rotate` | Rotate & Flip | `angle`, `flip` (horizontal/vertical/both), `background` |
| `convert` | Convert | `format` (jpeg/png/webp/avif/tiff/gif/heif), `quality` |
| `compress` | Compress | `quality` (1–100), `format`, `targetSizeKB` |

### Optimization

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `optimize-for-web` | Optimize for Web | `format` (auto/jpeg/webp/avif), `quality`, `maxWidthPx`, `stripMetadata` |
| `strip-metadata` | Strip Metadata | - |
| `edit-metadata` | Edit Metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Bulk Rename | `pattern` (supports `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Image to PDF | `pageSize` (A4/Letter/…), `orientation`, `margin`, `fitMode` |
| `favicon` | Favicon Generator | `padding`, `backgroundColor`, `borderRadius` - generates all standard sizes |

### Adjustments

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `adjust-colors` | Adjust Colors | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `sharpness`, `vibrance`, effects (grayscale/sepia/invert/vignette) |
| `sharpening` | Sharpening | `mode` (adaptive/unsharp/highpass), `amount`, `radius`, `threshold` |
| `replace-color` | Replace Color | `targetColor`, `replacementColor`, `tolerance`, `invert` |

### AI Tools

All AI tools run on your hardware (CPU or NVIDIA GPU). No internet required.

| Tool ID | Name | AI Model | Key settings |
|---------|------|---------|-------------|
| `remove-background` | Remove Background | rembg (BiRefNet / U2-Net) | `model`, `alphaMattingForeground`, `alphaMattingBackground`, `returnMask`, background color/image |
| `upscale` | Image Upscaling | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Object Eraser | LaMa (ONNX) | `maskData` (base64 PNG), `maskThreshold` |
| `ocr` | OCR / Text Extraction | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Face / PII Blur | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Smart Crop | MediaPipe + Sharp | `mode` (subject/face/trim), `width`, `height`, `facePreset` (close-up/head-and-shoulders/upper-body/half-body) |
| `image-enhancement` | Image Enhancement | Analysis-based | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Face Enhancement | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI Colorization | DDColor | `intensity`, `model` |
| `noise-removal` | Noise Removal | Tiered denoising | `quality` (fast/balanced/best), `strength`, `preserveDetail`, `colorNoise` |
| `red-eye-removal` | Red Eye Removal | Face landmark + color analysis | `sensitivity`, `strength` |
| `restore-photo` | Photo Restoration | Multi-step pipeline | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Passport Photo | MediaPipe landmarks | `country` (37 countries), `printLayout` (4x6/A4/none), `backgroundColor` |
| `content-aware-resize` | Content-Aware Resize | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |

### Watermark & Overlay

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `watermark-text` | Text Watermark | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Image Watermark | `opacity`, `position`, `scale` - second file is the watermark |
| `text-overlay` | Text Overlay | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Image Composition | `x`, `y`, `opacity`, `blend` - second file is layered on top |

### Utilities

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `info` | Image Info | - (returns width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Image Compare | `mode` (side-by-side/overlay/diff), `diffThreshold` - second file is the comparison target |
| `find-duplicates` | Find Duplicates | `threshold` (perceptual hash distance, default 8) - multi-file |
| `color-palette` | Color Palette | `count` (dominant color count), `format` (hex/rgb) |
| `qr-generate` | QR Code Generator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (optional file) |
| `barcode-read` | Barcode Reader | - (auto-detects QR, EAN, Code128, DataMatrix, etc.) |
| `image-to-base64` | Image to Base64 | `format` (data-uri/plain), `mimeType` |

### Layout & Composition

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `collage` | Collage / Grid | `template` (25+ layouts), `gap`, `backgroundColor`, `borderRadius` - multi-file |
| `stitch` | Stitch / Combine | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - multi-file |
| `split` | Image Splitting | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Border & Frame | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |

### Format & Conversion

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `svg-to-raster` | SVG to Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Image to SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF Tools | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), action-specific params |
| `pdf-to-image` | PDF to Image | `pages` (all/range), `format`, `dpi`, `quality` |

## Batch Processing

Apply any tool to multiple files at once. Returns a ZIP archive.

```bash
curl -X POST http://localhost:1349/api/v1/tools/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Concurrency is controlled by `CONCURRENT_JOBS` (default: auto-detected from CPU cores). Set `MAX_BATCH_SIZE` to limit the number of files per batch (default: unlimited).

## Pipelines

### Execute a pipeline

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline=[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline=[{"toolId":"resize","settings":{"width":800}}]'
```

Each step's output is the next step's input. Up to **20 steps** per pipeline.

### Save and manage pipelines

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Save a named pipeline (`name`, `description`, `steps`) |
| `GET` | `/api/v1/pipeline/list` | List saved pipelines (admins see all; users see own) |
| `DELETE` | `/api/v1/pipeline/:id` | Delete (owner or admin) |
| `GET` | `/api/v1/pipeline/tools` | List tool IDs valid for pipeline steps |

## Progress Tracking

Long-running jobs (AI tools, batch, pipelines) emit real-time progress via Server-Sent Events:

```bash
# Connect to the SSE stream (jobId returned in X-Job-Id response header)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress \
  -H "Authorization: Bearer <token>"
```

Event format:
```
data: {"progress":42,"status":"processing","message":"Upscaling frame 2/5"}
data: {"progress":100,"status":"completed"}
```

## File Library

Persistent file storage with version history.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Upload files to workspace |
| `GET` | `/api/v1/files` | List saved files (paginated, with search) |
| `GET` | `/api/v1/files/:id` | Get file metadata + version chain |
| `GET` | `/api/v1/files/:id/download` | Download file |
| `GET` | `/api/v1/files/:id/thumbnail` | Get 300px JPEG thumbnail |
| `DELETE` | `/api/v1/files/:id` | Delete file (and its version chain) |

To auto-save a tool result to the library, include `fileId` in the settings payload referencing an existing library file. The processed result will be saved as a new version.

## API Key Management

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Generate new key - shown once |
| `GET` | `/api/v1/api-keys` | Auth | List keys (name, id, lastUsedAt - not raw key) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Delete key |

## Teams

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Auth | List teams |
| `POST` | `/api/v1/teams` | Admin | Create team |
| `PUT` | `/api/v1/teams/:id` | Admin | Rename team |
| `DELETE` | `/api/v1/teams/:id` | Admin | Delete team (cannot delete default team or teams with members) |

## Branding

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/branding/logo` | Admin | Upload custom logo (max 500 KB, converted to 128×128 PNG) |
| `GET` | `/api/v1/branding/logo` | Public | Serve current logo |
| `DELETE` | `/api/v1/branding/logo` | Admin | Remove custom logo |

## Settings

Runtime key-value configuration (read by any authenticated user, write by admin only).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Get all settings |
| `PUT` | `/api/v1/settings/:key` | Set a value |

Known keys: `disabledTools` (JSON array of tool IDs), `enableExperimentalTools` (bool string), `loginAttemptLimit` (number), `customLogo` (managed via branding endpoint).

## Roles

Custom role management with granular permissions.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | List all roles with user counts |
| `POST` | `/api/v1/roles` | Admin (`users:manage`) | Create a custom role (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`users:manage`) | Update a custom role (cannot modify built-in roles) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`users:manage`) | Delete a custom role (cannot delete built-in roles; affected users revert to `user` role) |

Available permissions: `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `branding:manage`, `features:manage`, `system:health`, `audit:read`.

## Audit Log

Admin-only endpoint for reviewing security-relevant actions.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Paginated audit log with optional filters |

Query parameters:

| Parameter | Description |
|-----------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Entries per page (default: 50, max: 100) |
| `action` | Filter by action type (e.g. `ROLE_CREATED`, `ROLE_DELETED`) |
| `from` | Filter entries after this ISO 8601 date |
| `to` | Filter entries before this ISO 8601 date |

## Analytics

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Public | Get analytics configuration (PostHog key, Sentry DSN, sample rate). Returns empty values if `ANALYTICS_ENABLED=false`. |
| `PUT` | `/api/v1/user/analytics` | Auth | Set the current user's analytics consent (`enabled: true/false`) or defer with `remindLater: true`. |

## Features / AI Bundles

Manage AI feature bundles (install/uninstall AI model packages in the Docker environment).

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | List all feature bundles and their install status |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Install a feature bundle (async, returns `jobId` for progress tracking) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Uninstall a feature bundle and clean up model files |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Get total disk usage of AI models |

## Error Responses

All errors return JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid request / validation failed |
| 401 | Not authenticated |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 413 | File too large (see `MAX_UPLOAD_SIZE_MB`) |
| 429 | Rate limited (see `RATE_LIMIT_PER_MIN`) |
| 500 | Internal server error |
