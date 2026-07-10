---
description: Convert between mono and stereo or swap left and right channels.
---

# Audio Channels {#audio-channels}

Convert audio between mono and stereo layouts, or swap the left and right channels of a stereo file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | Channel operation: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- `stereo-to-mono` mixes both channels into a single mono track.
- `mono-to-stereo` duplicates the mono channel to both left and right.
- `swap` exchanges the left and right channels of a stereo file.
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
