---
description: Normalize video audio volume to broadcast standard.
---

# Normalize Audio

Normalize video audio volume to the EBU R128 broadcast loudness standard.

## API Endpoint

`POST /api/v1/tools/video-loudnorm`

Accepts multipart form data with a video file. This tool has no configurable settings.

## Parameters

This tool has no parameters. It applies EBU R128 loudness normalization to the audio track.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes

- Uses FFmpeg's two-pass `loudnorm` filter targeting -14 LUFS integrated loudness, the standard for streaming platforms.
- The source audio sample rate is preserved in the output.
- If the video has no audio track, the request returns a 400 error.
