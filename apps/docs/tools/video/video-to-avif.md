---
description: Convert a video clip into an animated AVIF image.
---

# Video to AVIF {#video-to-avif}

Convert a video clip into an animated AVIF image with configurable frame rate, width, quality, and clip range.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Output frame rate (1-30) |
| width | integer | No | `480` | Output width in pixels (64-1280). Height scales proportionally |
| startS | number | No | `0` | Where the clip starts, in seconds |
| durationS | number | No | `5` | Clip length in seconds (up to 60) |
| quality | integer | No | `50` | AVIF quality (1-100) |
| loop | boolean | No | `true` | Loop the animation |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 encoding is slower than GIF or WebP, so this tool usually answers `202` with a job to follow over SSE at `/api/v1/jobs/{jobId}/progress`. A short clip can finish inside the sync window and return the result directly:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Animated AVIF is royalty-free and usually smaller than an animated WebP or GIF at the same visual quality.
- Current browsers play animated AVIF. Some desktop image viewers show only the first frame.
- The audio track is dropped.
