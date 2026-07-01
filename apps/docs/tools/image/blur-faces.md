---
description: Auto-detect and blur faces in images with AI face detection for privacy and GDPR-compliant anonymization.
---

# Face / PII Blur

Auto-detect and blur faces in images using AI-powered face detection (MediaPipe).

## API Endpoint

`POST /api/v1/tools/image/blur-faces`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| blurRadius | number | No | `30` | Blur radius applied to detected faces (1-100) |
| sensitivity | number | No | `0.5` | Face detection sensitivity (0-1). Lower values detect fewer faces with higher confidence |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### No Faces Detected

If no faces are found, the result includes a warning:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notes

- Requires the `face-detection` model bundle to be installed (200-300 MB).
- Output format matches the input format automatically.
- The `faces` array contains bounding box coordinates (x, y, width, height) for each detected face.
- Increase `sensitivity` (closer to 1.0) to detect more faces, including partially occluded ones.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
