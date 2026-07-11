---
description: Reverse an audio file so it plays backwards.
---

# Reverse Audio {#reverse-audio}

Reverse an audio file so it plays backwards.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

This tool has no configurable parameters. The entire audio file is reversed.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- The full audio track is reversed from end to start.
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
