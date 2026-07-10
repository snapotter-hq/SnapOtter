---
description: Add fade-in and fade-out effects to audio.
---

# Fade Audio {#fade-audio}

Add fade-in and fade-out effects to the beginning and end of an audio file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | Fade-in duration in seconds (0 to 30) |
| fadeOutS | number | No | `1` | Fade-out duration in seconds (0 to 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Set either value to `0` to skip that fade direction. At least one must be greater than 0.
- The fade duration is clamped to the audio length if it exceeds it.
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
