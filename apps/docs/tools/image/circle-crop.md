---
description: Crop an image to a centered circle with transparent corners.
---

# Circle Crop

Crop an image to a centered circle with transparent corners. Supports adjustable zoom, offset, border, and output size.

## API Endpoint

`POST /api/v1/tools/image/circle-crop`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | Zoom factor (1-5); higher values crop tighter |
| offsetX | number | No | `0.5` | Horizontal center position (0-1) |
| offsetY | number | No | `0.5` | Vertical center position (0-1) |
| borderWidth | integer | No | `0` | Border width in pixels (0-200) |
| borderColor | string | No | `"#ffffff"` | Border hex color |
| background | string | No | `"transparent"` | Corner fill: `"transparent"` or a hex color |
| outputSize | integer | No | - | Final square dimension in pixels (16-4096) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes

- Output is always PNG to preserve the transparent corners (unless `background` is set to a solid color).
- The circle is inscribed within the shorter dimension of the image. Use `zoom` to crop tighter and `offsetX`/`offsetY` to shift the visible area.
- When `outputSize` is provided, the result is resized to that square dimension after cropping.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
