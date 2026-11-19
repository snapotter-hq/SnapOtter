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
| precise | boolean | No | `false` | Re-encode the whole range for exact start and end frames instead of copying from the next keyframe |

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

- When `precise` is `false` (the default), the clip starts on the exact frame you asked for. Only the frames between that start and the next keyframe are re-encoded and the rest is copied, so it stays fast. The end can run a frame or so long, because a copied stream keeps the frames that earlier frames depend on. Sources this can't splice safely (H.264 that is 10-bit or interlaced, other codecs that need a re-encoded start, or AVI, FLV, MPEG and TS files) are re-encoded in full instead.
- Setting `precise` to `true` always re-encodes the whole range, so both ends are exact, but it takes longer.
- The `endS` value must be greater than `startS`.
