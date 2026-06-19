---
description: Speed up or slow down audio playback with a multiplier.
---

# Audio Speed

Speed up or slow down audio playback by applying a speed multiplier.

## API Endpoint

`POST /api/v1/tools/audio-speed`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | Speed multiplier (0.25 to 4). Values below 1 slow down; above 1 speed up. |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Notes

- A factor of `0.25` plays at quarter speed (4x longer). A factor of `4` plays at quadruple speed (4x shorter).
- Pitch is preserved while speed changes (time-stretch). Use pitch-shift to adjust pitch independently.
- Output format matches the input format.
