---
description: Cut a section out of an audio file by specifying start and end times.
---

# Trim Audio

Cut a section out of an audio file by specifying start and end times in seconds.

## API Endpoint

`POST /api/v1/tools/audio/trim-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Start time in seconds (minimum 0) |
| endS | number | Yes | - | End time in seconds (must be after start) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes

- Times are specified in seconds and can include decimals (e.g. `10.5`).
- The `endS` value must be greater than `startS`.
- If `endS` exceeds the audio duration, the file is trimmed to the end.
- Output format matches the input format.
