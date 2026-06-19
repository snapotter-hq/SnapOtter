# AI Colorization

Convert black-and-white or grayscale photos to full color using AI (DDColor model with OpenCV DNN fallback).

## API Endpoint

`POST /api/v1/tools/colorize`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| intensity | number | No | `1.0` | Color intensity (0-1). Lower values produce more subtle colorization |
| model | string | No | `"auto"` | Model to use: `auto`, `ddcolor`, `opencv` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notes

- Requires the `object-eraser-colorize` model bundle to be installed (1-2 GB).
- DDColor produces higher quality results but is slower; OpenCV DNN is faster with slightly lower quality. `auto` uses DDColor when available with OpenCV fallback.
- The `intensity` parameter blends between the original grayscale and the AI-colorized result. Use 1.0 for full color, lower values for a partially desaturated vintage look.
- Output format matches the input format automatically.
- For non-browser-previewable output formats, a WebP preview is generated alongside the main output.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
