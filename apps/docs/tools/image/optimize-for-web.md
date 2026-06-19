---
description: Optimize images for web delivery with format conversion, quality control, resizing, and metadata stripping.
---

# Optimize for Web

Optimize images for web delivery in a single step. Combines format conversion, quality adjustment, optional resizing, progressive encoding, and metadata stripping.

## API Endpoint

`POST /api/v1/tools/optimize-for-web`

Accepts multipart form data with an image file and a JSON `settings` field.

A live preview endpoint is also available at `POST /api/v1/tools/optimize-for-web/preview`, which returns the processed image directly as binary (no workspace creation) for real-time parameter tuning.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | Output format: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | Output quality (1-100) |
| maxWidth | number | No | - | Maximum width in pixels. Image is downscaled if wider. |
| maxHeight | number | No | - | Maximum height in pixels. Image is downscaled if taller. |
| progressive | boolean | No | `true` | Enable progressive/interlaced encoding |
| stripMetadata | boolean | No | `true` | Remove EXIF, GPS, ICC, and XMP metadata |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optimize for AVIF with aggressive compression:

```bash
curl -X POST http://localhost:1349/api/v1/tools/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response

The preview endpoint (`/api/v1/tools/optimize-for-web/preview`) returns the binary image directly with informational headers:

- `X-Original-Size` - Original file size in bytes
- `X-Processed-Size` - Processed file size in bytes
- `X-Output-Filename` - URL-encoded output filename

## Notes

- This tool is designed as a one-stop optimization pipeline for web assets. It handles format conversion, quality tuning, max dimension capping, and metadata removal in a single pass.
- The output filename extension is updated to match the chosen format.
- JXL (JPEG XL) encoding uses a specialized CLI encoder. The image is first processed as PNG, then encoded to JXL.
- Progressive encoding improves perceived load time for JPEG and PNG by allowing browsers to render a low-quality preview before the full image loads.
- The preview endpoint is lighter weight (no workspace/job creation) and is intended for the frontend's live parameter tuning UI.
