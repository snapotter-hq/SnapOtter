---
description: Even out loudness to broadcast standard levels (EBU R128).
---

# Normalize Audio

Even out audio loudness to broadcast standard levels using EBU R128 normalization (-16 LUFS).

## API Endpoint

`POST /api/v1/tools/normalize-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

This tool has no configurable parameters. It applies EBU R128 loudness normalization automatically.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes

- Uses the EBU R128 loudness standard, targeting -16 LUFS.
- Ideal for podcasts, audiobooks, and broadcast content where consistent loudness is important.
- The source sample rate is preserved in the output.
- Output format matches the input format.
