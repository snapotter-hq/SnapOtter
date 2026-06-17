---
description: Fill bars with a blurred copy of the video.
---

# Blur Pad

Fit a video into a target aspect ratio by filling the padding area with a blurred, scaled copy of the video instead of solid-color bars.

## API Endpoint

`POST /api/v1/tools/blur-pad`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | Target aspect ratio: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | Gaussian blur sigma for the background (2-50) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes

- Higher blur values produce a softer, more abstract background. Lower values keep more detail visible.
- If the video already matches the target aspect ratio, the file is returned unchanged.
- For solid-color padding, use the Aspect Pad tool instead.
