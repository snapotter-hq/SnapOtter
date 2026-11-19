---
description: Cut a clip out of a video by specifying start and end times.
---

# Trim Video {#trim-video}

Cut a clip out of a video. Either keep the part between a start and end time, or cut a fixed amount off the beginning and end. There's an option for frame-accurate cuts.

In the app, time fields take plain seconds (`90`), `MM:SS` (`1:30`) or `HH:MM:SS` (`1:02:03.5`). The API takes seconds.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` keeps `startS` to `endS`. `ends` removes `cutStartS` from the beginning and `cutEndS` from the end |
| startS | number | No | `0` | Range mode: start time in seconds (must be >= 0) |
| endS | number | Range mode | - | Range mode: end time in seconds (must be after startS) |
| cutStartS | number | No | `0` | Ends mode: seconds to remove from the beginning |
| cutEndS | number | No | `0` | Ends mode: seconds to remove from the end |
| precise | boolean | No | `false` | Re-encode the whole range for exact start and end frames instead of copying from the next keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Cut the first 5 seconds and the last 10 seconds, whatever the video's length:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
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
- In range mode, `endS` must be greater than `startS`. If `endS` is past the end of the video, the clip runs to the end.
- In ends mode, at least one of `cutStartS` and `cutEndS` must be above zero, and together they must leave some of the video. Because the cut is measured from each file's own length, one setting works across a batch of videos with different durations.
