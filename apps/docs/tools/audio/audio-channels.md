---
description: Convert between mono and stereo or swap left and right channels.
---

# Audio Channels

Convert audio between mono and stereo layouts, or swap the left and right channels of a stereo file.

## API Endpoint

`POST /api/v1/tools/audio/audio-channels`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | Channel operation: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notes

- `stereo-to-mono` mixes both channels into a single mono track.
- `mono-to-stereo` duplicates the mono channel to both left and right.
- `swap` exchanges the left and right channels of a stereo file.
- Output format matches the input format.
