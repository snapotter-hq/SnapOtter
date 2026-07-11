---
description: Swap the audio track of a video with another file.
---

# Replace Audio {#replace-audio}

Swap the audio track of a video with an audio file. Upload both a video and an audio file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Accepts multipart form data with exactly two files: a video file followed by an audio file.

## Parameters {#parameters}

This tool has no settings parameters. Upload a video file and an audio file as two `file` parts.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Exactly two files must be uploaded: the first must be a video, the second must be an audio file.
- If the audio file is longer than the video, it is trimmed to match the video duration. If shorter, the remaining video plays in silence.
- The video stream is copied without re-encoding, so there is no video quality loss.
