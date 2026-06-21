---
description: Remove the audio track from a video.
---

# Mute Video

Remove the audio track from a video, leaving only the visual stream.

## API Endpoint

`POST /api/v1/tools/video/mute-video`

Accepts multipart form data with a video file. This tool has no configurable settings.

## Parameters

This tool has no parameters. It strips the audio track from the uploaded video.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes

- The video stream is copied without re-encoding, so there is no quality loss.
- If the input video has no audio track, the file is returned unchanged.
