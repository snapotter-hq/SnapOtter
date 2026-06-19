---
description: Extract frames from a video as a ZIP of images.
---

# Video to Frames

Extract individual frames from a video and download them as a ZIP archive of PNG or JPG images.

## API Endpoint

`POST /api/v1/tools/video-to-frames`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Extraction mode: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Extract every Nth frame (2-1000). Only used when mode is `"nth"` |
| timestamps | string | No | `""` | Comma-separated timestamps in seconds. Required when mode is `"timestamps"` |
| format | string | No | `"png"` | Image format for extracted frames: `png`, `jpg` |

## Example Request

Extract every 30th frame as JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Extract frames at specific timestamps:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes

- The `all` mode extracts every frame and can produce very large ZIP files for long videos. Use `nth` or `timestamps` mode for selective extraction.
- PNG preserves full quality but produces larger files. JPG is smaller but lossy.
- The response downloads as a ZIP archive containing sequentially numbered image files.
