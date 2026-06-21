---
description: Convert a video clip into an animated WebP image.
---

# Video to WebP

Convert a video clip into an animated WebP image with configurable frame rate, width, and quality.

## API Endpoint

`POST /api/v1/tools/video/video-to-webp`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Output frame rate (1-30) |
| width | integer | No | `480` | Output width in pixels (16-1920). Height scales proportionally |
| quality | integer | No | `75` | WebP compression quality (1-100) |
| loop | boolean | No | `true` | Loop the animation |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes

- Animated WebP produces smaller files than GIF with better color support (24-bit vs 8-bit palette).
- Lower `quality` values produce smaller files at the cost of visual fidelity.
- Set `loop` to `false` for animations that should play once and stop.
