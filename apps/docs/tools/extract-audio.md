---
description: Pull the audio track out of a video.
---

# Extract Audio

Extract the audio track from a video file and save it as MP3, WAV, or M4A.

## API Endpoint

`POST /api/v1/tools/extract-audio`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Output audio format: `mp3`, `wav`, `m4a` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes

- If the video has no audio track, the request returns a 400 error.
- MP3 is lossy but widely compatible. WAV is lossless but large. M4A (AAC) offers a good balance of quality and size.
- When the source audio is already AAC and the output format is M4A, the audio stream is copied without re-encoding.
