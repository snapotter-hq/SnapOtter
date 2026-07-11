---
description: Create a ringtone clip from any audio file.
---

# Ringtone Maker {#ringtone-maker}

Create a ringtone clip (.m4r) from any audio file by selecting a start time and duration.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Start time in seconds (minimum 0) |
| durationS | number | No | `30` | Clip duration in seconds (1 to 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Notes {#notes}

- Output is always M4R format, compatible with iPhone ringtones.
- Maximum ringtone duration is 30 seconds (Apple limit).
- Any audio format can be used as input.
