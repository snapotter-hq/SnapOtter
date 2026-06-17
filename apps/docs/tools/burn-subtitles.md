---
description: Permanently render subtitles onto video frames.
---

# Burn Subtitles

Permanently render (hard-code) subtitles from an SRT, VTT, or ASS file onto every frame of a video.

## API Endpoint

`POST /api/v1/tools/burn-subtitles`

Accepts multipart form data with a video file and a subtitle file. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Subtitle font size in pixels (8-72) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Upload two files: the first must be a video, the second must be a subtitle file (.srt, .vtt, or .ass).
- Burned subtitles are permanently part of the video and cannot be turned off by the viewer. For toggleable subtitles, use the Embed Subtitles tool instead.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
