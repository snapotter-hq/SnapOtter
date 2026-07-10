---
description: Combine multiple audio files into one sequential track.
---

# Merge Audio {#merge-audio}

Combine two or more audio files into a single sequential track, concatenated in the order they are uploaded.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Accepts multipart form data with multiple audio files and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Output format: `mp3`, `wav`, `flac`, `m4a` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Notes {#notes}

- Accepts 2 to 10 audio files per request.
- Files are concatenated in upload order.
- All input files are re-encoded to the chosen output format and sample rate for seamless joining.
- Mixed input formats are supported (e.g. one WAV and one MP3).
