---
description: AI-powered background removal with optional effects (blur, shadow, gradient, custom background).
---

# Remove Background {#remove-background}

AI-powered background removal with optional effects (blur, shadow, gradient, custom background).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| model | string | No | - | AI model variant to use |
| backgroundType | string | No | `"transparent"` | One of: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | - | Hex color for solid background |
| gradientColor1 | string | No | - | First gradient color |
| gradientColor2 | string | No | - | Second gradient color |
| gradientAngle | number | No | - | Gradient angle in degrees |
| blurEnabled | boolean | No | - | Enable background blur effect |
| blurIntensity | number | No | - | Blur intensity (0-100) |
| shadowEnabled | boolean | No | - | Enable drop shadow on subject |
| shadowOpacity | number | No | - | Shadow opacity (0-100) |
| outputFormat | string | No | - | Output format: `png`, `webp`, or `avif` |
| edgeRefine | integer | No | - | Edge refinement level (0-3) |
| decontaminate | boolean | No | - | Remove color bleed from edges |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Re-applies background effects without re-running the AI model. Uses cached mask and original from Phase 1.

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | JSON with effect settings (see below) |
| backgroundImage | file | No | - | Custom background image (when backgroundType is `image`) |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jobId | string | Yes | Job ID from Phase 1 |
| filename | string | Yes | Original filename from Phase 1 |
| backgroundType | string | No | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | Hex color for solid background |
| gradientColor1 | string | No | First gradient color |
| gradientColor2 | string | No | Second gradient color |
| gradientAngle | number | No | Gradient angle in degrees |
| blurEnabled | boolean | No | Enable background blur |
| blurIntensity | number | No | Blur intensity (0-100) |
| shadowEnabled | boolean | No | Enable drop shadow |
| shadowOpacity | number | No | Shadow opacity (0-100) |
| outputFormat | string | No | `png`, `webp`, or `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notes {#notes}

- Requires the `background-removal` model bundle to be installed (4-5 GB).
- Phase 1 caches the transparent mask and original image so that Phase 2 (effects) can re-apply different backgrounds instantly without re-running the AI model.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
- EXIF rotation is auto-corrected before processing.
