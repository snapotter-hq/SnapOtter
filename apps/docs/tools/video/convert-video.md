---
description: Convert videos between MP4, MOV, WebM, AVI, and MKV.
---

# Convert Video {#convert-video}

Convert videos between MP4, MOV, WebM, AVI, and MKV formats with configurable quality presets.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Accepts multipart form data with a video file and a JSON `settings` field. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Output format: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Quality preset: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- The `high` quality preset produces the best visual fidelity but larger files. The `small` preset aggressively compresses for minimum file size.
- WebM output uses VP9 encoding. MP4 and MOV use H.264. AVI and MKV are available for legacy or archival workflows.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
