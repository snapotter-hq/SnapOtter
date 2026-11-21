---
description: Turn a set of images into a slideshow video, an animated GIF, or an animated WebP.
---

# Images to Video {#images-to-video}

Turn a set of images into a slideshow video with configurable duration per image, resolution, and frame rate, or into an animated GIF or WebP with a set time per frame and loop count.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accepts multipart form data with two or more image files and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Output format: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | MP4 only. Display duration per image in seconds (0.5-10) |
| resolution | string | No | `"720p"` | MP4 only. Output resolution: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | MP4 only. Output frame rate (10-60) |
| frameDelayMs | integer | No | `500` | GIF and WebP only. Time each image is shown, in milliseconds (20-10000) |
| loop | integer | No | `0` | GIF and WebP only. How many times the animation plays; `0` loops forever (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

To build an animated GIF that shows each image for 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Accepts 2-60 image files per request. Images appear in the video in upload order.
- For MP4, images are resized and padded to fit the target resolution while preserving aspect ratio.
- The `square` resolution option produces a 1080x1080 video, useful for social media.
- MP4 output is H.264, named `slideshow.mp4`.
- GIF and WebP output uses the first image's size. Images of other sizes are scaled to fit inside it, and the leftover area is transparent. The file is named `slideshow.gif` or `slideshow.webp`.
- GIF stores frame times in hundredths of a second, so `frameDelayMs` is rounded to the nearest 10 ms in a GIF. WebP keeps the exact value.
- Large animations are refused rather than built: the frame size times the number of images has to stay under the same pixel limit the GIF tools use.
