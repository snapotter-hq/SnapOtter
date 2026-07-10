---
description: Cut a clip out of a video by specifying start and end times.
---

# Trim Video {#trim-video}

Cut a clip out of a video by specifying start and end times in seconds, with an option for frame-accurate cuts.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Start time in seconds (must be >= 0) |
| endS | number | Yes | - | End time in seconds (must be after startS) |
| precise | boolean | No | `false` | Re-encode for frame-accurate cuts instead of keyframe seek |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- When `precise` is `false` (the default), the tool uses keyframe seeking, which is fast but may start a few frames before the requested time.
- Setting `precise` to `true` re-encodes the segment for exact frame boundaries, but takes longer.
- The `endS` value must be greater than `startS`.
