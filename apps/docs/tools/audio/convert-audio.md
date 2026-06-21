---
description: Convert audio between MP3, WAV, OGG, FLAC, and M4A formats.
---

# Convert Audio

Convert audio files between common formats including MP3, WAV, OGG, FLAC, and M4A, with configurable output bitrate.

## API Endpoint

`POST /api/v1/tools/audio/convert-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Output format: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | Output bitrate in kbps (32 to 320) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Notes

- Supported input formats include MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, and OPUS.
- Bitrate only applies to lossy formats (MP3, OGG, M4A). Lossless formats like WAV and FLAC ignore this setting.
- The output filename keeps the original name with the new extension.
