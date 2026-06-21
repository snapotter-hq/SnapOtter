---
description: Adjust brightness, contrast, saturation, and gamma of a video.
---

# Video Color

Adjust brightness, contrast, saturation, and gamma correction on a video.

## API Endpoint

`POST /api/v1/tools/video/video-color`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Brightness adjustment (-1 to 1) |
| contrast | number | No | `1` | Contrast multiplier (0-4) |
| saturation | number | No | `1` | Saturation multiplier (0-3). Set to 0 for grayscale |
| gamma | number | No | `1` | Gamma correction (0.1-10) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes

- All values at their defaults (brightness 0, contrast 1, saturation 1, gamma 1) produce no change.
- Setting saturation to `0` converts the video to grayscale.
- Gamma values below 1 brighten shadows, while values above 1 darken them.
