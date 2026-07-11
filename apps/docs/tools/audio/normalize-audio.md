---
description: Even out loudness to broadcast standard levels (EBU R128).
---

# Normalize Audio {#normalize-audio}

Even out audio loudness to broadcast standard levels using EBU R128 normalization (-16 LUFS).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

This tool has no configurable parameters. It applies EBU R128 loudness normalization automatically.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- Uses the EBU R128 loudness standard, targeting -16 LUFS.
- Ideal for podcasts, audiobooks, and broadcast content where consistent loudness is important.
- The source sample rate is preserved in the output.
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
