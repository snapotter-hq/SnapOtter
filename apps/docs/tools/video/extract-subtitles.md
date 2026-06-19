---
description: Pull the subtitle track out of a video as an SRT file.
---

# Extract Subtitles

Extract the embedded subtitle track from a video container and download it as an SRT file.

## API Endpoint

`POST /api/v1/tools/extract-subtitles`

Accepts multipart form data with a video file. This tool has no configurable settings.

## Parameters

This tool has no parameters. It extracts the first subtitle track found in the video container.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes

- The video must contain an embedded subtitle track. If no subtitle track is found, the request returns a 400 error.
- If the video has multiple subtitle tracks, the first one is extracted.
- The output format is SRT regardless of the original subtitle format in the container.
