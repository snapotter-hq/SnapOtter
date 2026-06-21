---
description: AI-powered detection and correction of red eye caused by camera flash.
---

# Red Eye Removal

AI-powered detection and correction of red eye caused by camera flash.

## API Endpoint

`POST /api/v1/tools/image/red-eye-removal`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| sensitivity | number | No | `50` | Red eye detection sensitivity (0-100). Higher values detect more subtle red-eye |
| strength | number | No | `70` | Correction strength (0-100). How aggressively to neutralize red |
| format | string | No | - | Output format (optional override) |
| quality | number | No | `90` | Output quality (1-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notes

- Requires the `face-detection` model bundle to be installed (200-300 MB).
- First detects faces, then locates eye regions within each face, and finally identifies and corrects red-eye pixels.
- The `facesDetected` count indicates how many faces were found; `eyesCorrected` is the total number of individual eyes that had red-eye corrected.
- Output is always PNG for maximum quality preservation.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
