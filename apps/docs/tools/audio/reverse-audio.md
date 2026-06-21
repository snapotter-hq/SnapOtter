---
description: Reverse an audio file so it plays backwards.
---

# Reverse Audio

Reverse an audio file so it plays backwards.

## API Endpoint

`POST /api/v1/tools/audio/reverse-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

This tool has no configurable parameters. The entire audio file is reversed.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
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

- The full audio track is reversed from end to start.
- Output format matches the input format.
