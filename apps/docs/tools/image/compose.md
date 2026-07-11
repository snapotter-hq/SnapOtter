---
description: Layer images with position, opacity, and blend modes for compositing.
---

# Image Composition {#image-composition}

Layer an overlay image on top of a base image with configurable position, opacity, and blend mode. Useful for compositing logos, graphics, or combining multiple images.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

Accepts multipart form data with **two** image files and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | Horizontal offset of the overlay from the top-left corner in pixels (min 0) |
| y | number | No | `0` | Vertical offset of the overlay from the top-left corner in pixels (min 0) |
| opacity | number | No | `100` | Overlay opacity percentage (0 to 100) |
| blendMode | string | No | `"over"` | Compositing blend mode |

### Blend Modes {#blend-modes}

| Value | Description |
|-------|-------------|
| `over` | Normal overlay (default) |
| `multiply` | Darken by multiplying pixel values |
| `screen` | Lighten by inverting, multiplying, and inverting again |
| `overlay` | Combines multiply and screen based on base brightness |
| `darken` | Keep the darker pixel from each layer |
| `lighten` | Keep the lighter pixel from each layer |
| `hard-light` | Strong contrast overlay |
| `soft-light` | Subtle contrast overlay |
| `difference` | Absolute difference between layers |
| `exclusion` | Similar to difference but lower contrast |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | The base/background image |
| overlay | Yes | The overlay/foreground image |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Using multiply blend mode:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notes {#notes}

- Both images are validated and decoded (HEIC, RAW, PSD, SVG supported) before compositing.
- The overlay is placed at the exact pixel coordinates specified by `x` and `y`. It is not resized to fit.
- If opacity is less than 100, an alpha mask is applied to the overlay before blending.
- The overlay can extend beyond the base image boundaries (it will be clipped).
- EXIF orientation is auto-applied on both images before processing.
- Output dimensions match the base image dimensions.
