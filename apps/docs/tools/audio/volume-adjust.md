---
description: Increase or decrease audio volume by a fixed gain in decibels.
---

# Volume Adjust

Increase or decrease the volume of an audio file by applying a fixed gain in decibels.

## API Endpoint

`POST /api/v1/tools/volume-adjust`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Volume adjustment in decibels (-30 to 30) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
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

- Positive values increase volume; negative values decrease it.
- Large positive gains can cause clipping. Use normalize-audio for loudness-safe leveling.
- Output format matches the input format.
