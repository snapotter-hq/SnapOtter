---
description: Fix fake transparent PNGs with AI matting (BiRefNet) to produce true alpha, plus defringe edge cleanup.
---

# PNG Transparency Fixer {#png-transparency-fixer}

Fix fake transparent PNGs in one click. Uses AI matting (BiRefNet HR Matting model) to produce true alpha transparency, with defringe post-processing to clean up edges.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| defringe | number | No | `30` | Defringe intensity (0-100). Removes semi-transparent fringe pixels around edges |
| outputFormat | string | No | `"png"` | Output format: `png` or `webp` |
| removeWatermark | boolean | No | `false` | Apply watermark removal pre-processing (median filter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notes {#notes}

- Requires the `background-removal` model bundle to be installed (4-5 GB).
- Uses `birefnet-hr-matting` as the primary model for high-quality alpha matting. Falls back to `birefnet-general` if the HR model runs out of memory.
- The `defringe` option removes semi-transparent fringe pixels that AI matting sometimes leaves around hair, fur, and fine edges. It works by blurring the alpha channel and zeroing out low-confidence pixels.
- The `removeWatermark` option applies a median filter pre-processing step. It is a basic watermark reduction, not a dedicated watermark removal tool.
- Only outputs PNG or lossless WebP (both support alpha transparency).
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
