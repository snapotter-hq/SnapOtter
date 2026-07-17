---
description: Convert audio between MP3, WAV, OGG, FLAC, and M4A formats.
---

# Convert Audio {#convert-audio}

Convert audio files between common formats including MP3, WAV, OGG, FLAC, and M4A, with configurable output bitrate and sample rate.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Output format: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | Output bitrate in kbps (32 to 320) |
| sampleRate | integer | No | source rate | Output sample rate in Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000`, or `96000`. Omit to keep the source rate |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Supported input formats include MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, and OPUS.
- Bitrate only applies to lossy formats (MP3, OGG, M4A). Lossless formats like WAV and FLAC ignore this setting.
- MP3 output supports sample rates up to 48000 Hz. The 96000 Hz option applies to WAV, OGG, FLAC, and M4A only.
- MP3 bitrate is capped by the sample rate: at most 64 kbps at 8000 Hz and 160 kbps at 16000 or 22050 Hz. Requests above the cap are rejected instead of being silently lowered.
- The output filename keeps the original name with the new extension.
