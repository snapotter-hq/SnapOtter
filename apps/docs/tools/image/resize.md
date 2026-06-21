---
description: Resize images by pixels, percentage, or with fit modes.
---

# Resize

Resize images by specifying exact pixel dimensions, a percentage scale factor, or a fit mode that controls how the image adapts to the target dimensions.

## API Endpoint

`POST /api/v1/tools/image/resize`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Target width in pixels (max 16383) |
| height | integer | No | - | Target height in pixels (max 16383) |
| fit | string | No | `"contain"` | How the image fits the dimensions: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | Prevent upscaling if image is smaller than target |
| percentage | number | No | - | Scale by percentage (e.g. 50 for half size) |

At least one of `width`, `height`, or `percentage` must be provided.

### Fit Modes

- **contain** - Resize to fit within the dimensions, preserving aspect ratio (may leave empty space)
- **cover** - Resize to cover the dimensions, preserving aspect ratio (may crop)
- **fill** - Stretch to exactly match dimensions (ignores aspect ratio)
- **inside** - Like `contain`, but only downscales, never upscales
- **outside** - Like `cover`, but only downscales, never upscales

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Resize by percentage:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes

- Maximum dimension is 16383 pixels on either axis (Sharp/libvips limit).
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
- EXIF orientation is auto-applied before resizing.
- The `withoutEnlargement` flag is useful for batch processing where some images may already be smaller than the target.
