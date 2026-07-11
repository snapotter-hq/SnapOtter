---
description: Reduce background noise from audio with FFT-based denoising.
---

# Noise Reduction {#noise-reduction}

Reduce background noise in an audio file using FFT-based denoising with selectable strength.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | Denoising strength: `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- `light` preserves more detail but removes less noise. `strong` removes more noise but may introduce subtle artifacts.
- Best results on recordings with consistent background noise (fan hum, air conditioning, static).
- Output usually keeps the input container. AAC input is written as M4A, and unsupported decode-only inputs fall back to MP3.
