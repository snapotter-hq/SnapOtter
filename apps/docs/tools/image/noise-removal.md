---
description: AI-powered noise and grain removal with multi-tier quality options.
---

# Noise Removal

AI-powered noise and grain removal with multi-tier quality options, using the Python sidecar (SCUNet model).

## API Endpoint

`POST /api/v1/tools/image/noise-removal`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `upscale-enhance` (4-5 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| tier | string | No | `"balanced"` | Quality tier: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | Denoising strength (0-100) |
| detailPreservation | number | No | `50` | How much detail to preserve (0-100). Higher values keep more texture |
| colorNoise | number | No | `30` | Color noise reduction strength (0-100) |
| format | string | No | `"original"` | Output format: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | Output encoding quality (1-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes

- Requires the `upscale-enhance` model bundle to be installed (4-5 GB).
- Quality tiers trade speed for quality: `quick` is fastest with basic denoising, `maximum` uses the most thorough multi-pass approach.
- The `detailPreservation` parameter is critical for textured subjects (fabric, hair, foliage). Higher values prevent the denoiser from smoothing away fine detail.
- When `format` is set to `"original"`, the output format matches the input file format.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
