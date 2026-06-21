---
description: Reduce camera shake with two-pass stabilization.
---

# Stabilize Video

Reduce camera shake in handheld footage using FFmpeg's two-pass vidstab stabilization.

## API Endpoint

`POST /api/v1/tools/video/stabilize-video`

Accepts multipart form data with a video file and a JSON `settings` field. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Smoothing window size in frames (5-60). Higher values produce smoother motion |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Stabilization is a two-pass process: the first pass analyzes camera motion, and the second pass applies the correction. This takes roughly twice as long as single-pass tools.
- Higher smoothing values remove more shake but may introduce a slight zoom crop at the edges.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
