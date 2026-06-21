---
description: Shrink video file size with quality control.
---

# Compress Video

Shrink video file size using configurable compression strength and optional resolution downscaling.

## API Endpoint

`POST /api/v1/tools/video/compress-video`

Accepts multipart form data with a video file and a JSON `settings` field. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Compression strength: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Output resolution: `original`, `1080p`, `720p`, `480p` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- The `light` preset preserves near-original quality. The `strong` preset reduces file size aggressively at the cost of visual fidelity.
- Downscaling resolution (e.g. from 4K to 720p) compounds with compression for significant size reduction.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
