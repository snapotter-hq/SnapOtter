---
description: Upscale images 2x to 4x with Real-ESRGAN AI super-resolution while preserving fine detail.
---

# Image Upscaling

AI super-resolution enhancement using Real-ESRGAN. Upscales images 2x-4x while preserving detail.

## API Endpoint

`POST /api/v1/tools/image/upscale`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `upscale-enhance` (4-5 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| scale | number | No | `2` | Upscale factor (e.g., 2, 3, 4) |
| model | string | No | `"auto"` | Model to use (e.g., `auto`, specific model names) |
| faceEnhance | boolean | No | `false` | Apply face enhancement during upscaling |
| denoise | number | No | `0` | Denoising strength (0 = off) |
| format | string | No | `"auto"` | Output format: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | Output quality (1-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Response

### Initial Response (202 Accepted)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`)

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notes

- Requires the `upscale-enhance` model bundle to be installed (4-5 GB).
- Uses Real-ESRGAN when available; falls back to Lanczos interpolation if the AI model is unavailable.
- The `faceEnhance` option applies GFPGAN face restoration during upscaling for better face quality.
- For non-browser-previewable output formats (HEIC, JXL, TIFF), a WebP preview is generated alongside the main output.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
