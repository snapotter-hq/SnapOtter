---
description: Play a video clip backwards.
---

# Reverse Video

Play a video clip backwards. The audio track is also reversed.

## API Endpoint

`POST /api/v1/tools/video/reverse-video`

Accepts multipart form data with a video file. This tool has no configurable settings.

## Parameters

This tool has no parameters. It reverses the entire video.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes

- Limited to clips up to 5 minutes in length. Longer videos are rejected with a 400 error.
- Both video and audio tracks are reversed. To reverse video without audio, mute it first.
