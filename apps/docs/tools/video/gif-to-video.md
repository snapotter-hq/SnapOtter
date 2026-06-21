---
description: Convert an animated GIF into an MP4 or WebM video.
---

# GIF to Video

Convert an animated GIF into a compact MP4 or WebM video file.

## API Endpoint

`POST /api/v1/tools/video/gif-to-video`

Accepts multipart form data with a GIF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Output format: `mp4`, `webm` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes

- Converting GIF to video typically reduces file size by 80-90% while maintaining the same visual quality.
- Only animated GIF files are accepted. Static images should use the image Convert tool.
- MP4 uses H.264 encoding, WebM uses VP9.
