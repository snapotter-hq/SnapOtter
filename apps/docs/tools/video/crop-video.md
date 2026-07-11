---
description: Crop a region out of a video.
---

# Crop Video {#crop-video}

Crop a rectangular region out of a video by specifying the region's size and position.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Crop region width in pixels (minimum 16) |
| height | integer | Yes | - | Crop region height in pixels (minimum 16) |
| x | integer | No | `0` | Horizontal offset from the top-left corner |
| y | integer | No | `0` | Vertical offset from the top-left corner |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- The crop region must fit within the video dimensions. If `x + width` or `y + height` exceeds the source size, the request returns a 400 error.
- Minimum crop size is 16x16 pixels.
- Dimensions are rounded to even numbers as required by most video codecs.
