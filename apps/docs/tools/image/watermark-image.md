---
description: Overlay a logo or image as a watermark with configurable position, opacity, and scale.
---

# Image Watermark

Overlay a logo or secondary image as a watermark on a base image. The watermark is scaled relative to the base image width and positioned at a corner or center.

## API Endpoint

`POST /api/v1/tools/image/watermark-image`

Accepts multipart form data with **two** image files and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | Watermark placement: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | Watermark opacity percentage (0 to 100) |
| scale | number | No | `25` | Watermark width as percentage of main image width (1 to 100) |

### File Fields

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | The main/base image |
| watermark | Yes | The watermark/logo image |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notes

- Both images are validated and decoded (HEIC, RAW, PSD, SVG supported).
- The watermark is resized proportionally so its width equals `scale`% of the main image width.
- Opacity is applied via an alpha mask composited with `dest-in` blending.
- Corner positions use a 20px padding from the image edge.
- If the watermark image has transparency (e.g., a PNG logo), it is preserved during compositing.
- EXIF orientation is auto-applied on both images before processing.
