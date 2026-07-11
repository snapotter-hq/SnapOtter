---
description: Turn a video clip into an animated GIF.
---

# Video to GIF {#video-to-gif}

Turn a video clip into an animated GIF with configurable frame rate, width, start time, and duration.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Accepts multipart form data with a video file and a JSON `settings` field. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Output frame rate (1-30) |
| width | integer | No | `480` | Output width in pixels (64-1280). Height scales proportionally |
| startS | number | No | `0` | Start time in seconds (must be >= 0) |
| durationS | number | No | `5` | Duration in seconds (above 0, max 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Lower `fps` and `width` values produce smaller GIF files. A 480px-wide GIF at 12 fps is usually a good balance.
- Maximum duration is 60 seconds. Longer clips produce very large files.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
