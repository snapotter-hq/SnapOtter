---
description: Turn a set of images into a slideshow video.
---

# Images to Video

Turn a set of images into a slideshow video with configurable duration per image, resolution, and frame rate.

## API Endpoint

`POST /api/v1/tools/images-to-video`

Accepts multipart form data with two or more image files and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Display duration per image in seconds (0.5-10) |
| resolution | string | No | `"720p"` | Output resolution: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Output frame rate (10-60) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes

- Accepts 2-60 image files per request. Images appear in the video in upload order.
- Images are resized and padded to fit the target resolution while preserving aspect ratio.
- The `square` resolution option produces a 720x720 video, useful for social media.
- Output format is always MP4 (H.264).
