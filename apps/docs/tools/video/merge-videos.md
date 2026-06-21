---
description: Join multiple video clips into one file.
---

# Merge Videos

Join multiple video clips into a single MP4 file. All inputs are normalized to the first video's resolution and 30 fps.

## API Endpoint

`POST /api/v1/tools/video/merge-videos`

Accepts multipart form data with two or more video files. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters

This tool has no settings parameters. Upload 2-10 video files as multiple `file` parts.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Clips are concatenated in the order they are uploaded.
- All clips are re-encoded to match the first clip's resolution, frame rate (30 fps), and codec (H.264). Mismatched inputs are automatically normalized.
- Accepts 2-10 video files per request.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
