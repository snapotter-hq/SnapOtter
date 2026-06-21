---
description: Add fade-in and fade-out effects to audio.
---

# Fade Audio

Add fade-in and fade-out effects to the beginning and end of an audio file.

## API Endpoint

`POST /api/v1/tools/audio/fade-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | Fade-in duration in seconds (0 to 30) |
| fadeOutS | number | No | `1` | Fade-out duration in seconds (0 to 30) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- Set either value to `0` to skip that fade direction. At least one must be greater than 0.
- The fade duration is clamped to the audio length if it exceeds it.
- Output format matches the input format.
