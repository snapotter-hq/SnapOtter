# Face Enhancement

Restore and enhance faces in images using AI models (GFPGAN/CodeFormer).

## API Endpoint

`POST /api/v1/tools/image/enhance-faces`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `upscale-enhance` (4-5 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| model | string | No | `"auto"` | Model to use: `auto`, `gfpgan`, `codeformer` |
| strength | number | No | `0.8` | Enhancement strength (0-1). Higher values produce stronger enhancement |
| onlyCenterFace | boolean | No | `false` | Only enhance the most central/prominent face |
| sensitivity | number | No | `0.5` | Face detection sensitivity (0-1) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notes

- Requires the `upscale-enhance` model bundle to be installed (4-5 GB).
- GFPGAN produces more aggressive enhancement; CodeFormer better preserves identity. `auto` selects the best model for the input.
- Output is always PNG format for maximum quality.
- A WebP preview is generated alongside the full-resolution output for faster frontend display.
- The `strength` parameter blends the enhanced face with the original. Use lower values (0.3-0.5) for subtle improvements, higher values (0.7-1.0) for stronger restoration.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
