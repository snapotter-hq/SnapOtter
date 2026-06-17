---
description: Scale a video to a new resolution or preset size.
---

# Resize Video

Scale a video to a new resolution using custom pixel dimensions or a standard preset.

## API Endpoint

`POST /api/v1/tools/resize-video`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Target width in pixels (16-7680) |
| height | integer | No | - | Target height in pixels (16-4320) |
| preset | string | No | `"custom"` | Resolution preset: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

When `preset` is `"custom"`, at least one of `width` or `height` must be provided. The other dimension scales proportionally.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Resize to custom dimensions:

```bash
curl -X POST http://localhost:1349/api/v1/tools/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes

- Preset values map to standard heights (e.g. `720p` = 1280x720, `1080p` = 1920x1080). Width scales proportionally from the source aspect ratio.
- Dimensions are rounded to even numbers as required by most video codecs.
- Maximum supported resolution is 7680x4320 (8K UHD).
