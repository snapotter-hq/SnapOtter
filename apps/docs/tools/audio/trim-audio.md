---
description: Cut a section out of an audio file by specifying start and end times.
---

# Trim Audio {#trim-audio}

Cut a section out of an audio file. Either keep the part between a start and end time, or cut a fixed amount off the beginning and end.

In the app, time fields take plain seconds (`90`), `MM:SS` (`1:30`) or `HH:MM:SS` (`1:02:03.5`). The API takes seconds.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` keeps `startS` to `endS`. `ends` removes `cutStartS` from the beginning and `cutEndS` from the end |
| startS | number | No | `0` | Range mode: start time in seconds (minimum 0) |
| endS | number | Range mode | - | Range mode: end time in seconds (must be after start) |
| cutStartS | number | No | `0` | Ends mode: seconds to remove from the beginning |
| cutEndS | number | No | `0` | Ends mode: seconds to remove from the end |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Cut the first 2 seconds and the last 3 seconds, whatever the file's length:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Times are specified in seconds and can include decimals (e.g. `10.5`).
- In range mode, `endS` must be greater than `startS`. If `endS` exceeds the audio duration, the file is trimmed to the end.
- In ends mode, at least one of `cutStartS` and `cutEndS` must be above zero, and together they must leave at least 0.1 seconds of audio. Because the cut is measured from each file's own length, one setting works across a batch of files with different durations.
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
