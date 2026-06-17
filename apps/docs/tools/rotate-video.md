---
description: Rotate or flip a video.
---

# Rotate Video

Rotate a video by 90, 180, or 270 degrees, or flip it horizontally or vertically.

## API Endpoint

`POST /api/v1/tools/rotate-video`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Transformation to apply: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values

- **cw90** - Rotate 90 degrees clockwise
- **ccw90** - Rotate 90 degrees counter-clockwise
- **180** - Rotate 180 degrees
- **hflip** - Flip horizontally (mirror)
- **vflip** - Flip vertically

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes

- Rotations by 90 or 270 degrees swap the video's width and height.
- Flip operations (hflip, vflip) do not change the video dimensions.
