---
description: Convert animated GIF to WebP and vice versa, preserving all frames.
---

# GIF/WebP Converter

Convert animated GIF files to WebP and vice versa, preserving all frames and animation timing. WebP animations are typically 25-35% smaller than equivalent GIFs.

## API Endpoint

`POST /api/v1/tools/gif-webp`

Accepts multipart form data with a GIF or WebP file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | integer | No | `80` | Output quality for WebP encoding (1-100) |
| lossless | boolean | No | `false` | Use lossless WebP compression |
| resizePercent | integer | No | `100` | Scale the output by percentage (10-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notes

- Only `.gif` and `.webp` files are accepted. Other image formats are not supported by this tool.
- The conversion direction is automatic: GIF input produces WebP output, and WebP input produces GIF output.
- The `quality` and `lossless` options only apply when encoding to WebP. When converting to GIF, the output uses the standard GIF palette.
- Use `resizePercent` to reduce the dimensions (and file size) of large animations.
