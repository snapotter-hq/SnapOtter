---
description: Strip silent sections from an audio file.
---

# Silence Removal {#silence-removal}

Detect and remove silent sections from an audio file based on a configurable threshold and minimum duration.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Silence threshold in dB (-80 to -20). Audio below this level is considered silent. |
| minSilenceS | number | No | `0.5` | Minimum silence duration in seconds to remove (0.1 to 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- A higher (less negative) threshold is more aggressive and removes quieter passages as well as true silence.
- Increase `minSilenceS` to only strip longer pauses while keeping short natural gaps.
- Useful for cleaning up podcast recordings, lectures, and voice memos.
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
