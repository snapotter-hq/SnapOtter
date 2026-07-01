---
description: Remove unwanted objects from images with AI inpainting (LaMa), guided by a mask of the region to erase.
---

# Object Eraser

Remove unwanted objects from images using AI inpainting (LaMa model). Accepts an image and a mask indicating the region to erase.

## API Endpoint

`POST /api/v1/tools/image/erase-object`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Source image file (multipart) |
| mask | file | Yes | - | Mask image (white = area to erase, black = keep). Must be uploaded with fieldname `mask` |
| format | string | No | `"auto"` | Output format: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Output quality (1-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notes

- Requires the `object-eraser-colorize` model bundle to be installed (1-2 GB).
- The mask must be the same dimensions as the source image. White pixels indicate areas to erase; the AI fills them with plausible content.
- Uses LaMa (Large Mask Inpainting) for high-quality object removal.
- For non-browser-previewable output formats, a WebP preview is generated alongside the main output.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
