---
description: Change the frame rate of a video.
---

# Change FPS

Change the frame rate of a video to a target value between 1 and 120 fps.

## API Endpoint

`POST /api/v1/tools/video/change-fps`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Target frame rate (1-120) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes

- Lowering the frame rate drops frames and reduces file size. Increasing it duplicates frames to fill the gap but does not add real motion detail.
- Common target values: 24 (cinema), 30 (web/broadcast), 60 (smooth playback).
- The audio track is preserved at its original sample rate.
