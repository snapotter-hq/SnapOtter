---
description: Speed up or slow down a video.
---

# Video Speed

Speed up or slow down a video with an option to preserve audio pitch.

## API Endpoint

`POST /api/v1/tools/video-speed`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Speed multiplier (0.25-4). Values above 1 speed up, below 1 slow down |
| keepPitch | boolean | No | `true` | Preserve audio pitch when changing speed |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes

- A factor of `2` doubles playback speed (halves duration). A factor of `0.5` halves playback speed (doubles duration).
- When `keepPitch` is `true`, the audio is time-stretched so voices sound natural. When `false`, pitch shifts proportionally with speed.
- The valid range is 0.25x to 4x.
