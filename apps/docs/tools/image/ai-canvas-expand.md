# AI Canvas Expand

Expand the canvas of an image with AI-powered fill (outpainting). Extends the image in any direction and fills the new areas with AI-generated content that matches the existing image.

## API Endpoint

`POST /api/v1/tools/ai-canvas-expand`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| extendTop | integer | No | `0` | Pixels to extend at the top |
| extendRight | integer | No | `0` | Pixels to extend at the right |
| extendBottom | integer | No | `0` | Pixels to extend at the bottom |
| extendLeft | integer | No | `0` | Pixels to extend at the left |
| tier | string | No | `"balanced"` | Quality tier: `fast`, `balanced`, `high` |
| format | string | No | `"auto"` | Output format: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Output quality (1-100) |

At least one extend direction must be greater than 0.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes

- Requires the `object-eraser-colorize` model bundle to be installed (1-2 GB).
- Uses LaMa-based outpainting to generate content for the expanded regions.
- The `tier` parameter trades speed for quality: `fast` produces results quickly with potential artifacts, `high` takes longer but produces smoother, more coherent fills.
- Extend values are in pixels. The final image dimensions will be: original width + extendLeft + extendRight by original height + extendTop + extendBottom.
- For non-browser-previewable output formats (HEIC, JXL, TIFF), a WebP preview is generated alongside the main output.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
