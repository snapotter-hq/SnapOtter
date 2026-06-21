---
description: Combine one or more images into a PDF document with page size, orientation, and target file size options.
---

# Image to PDF

Combine one or more images into a PDF document. Supports multiple page sizes, orientations, margins, and optional file size targeting via quality adjustment.

## API Endpoint

`POST /api/v1/tools/image/image-to-pdf`

Accepts multipart form data with one or more image files and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"A4"` | Page size: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | No | `"portrait"` | Page orientation: `portrait` or `landscape` |
| margin | number | No | `20` | Page margin in points (0-500) |
| targetSize | object | No | - | Target file size constraint (see below) |
| collate | boolean | No | `true` | Combine all images into one PDF. If `false`, creates one PDF per image. |

### Target Size Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| value | number | Yes | Target size value |
| unit | string | Yes | Unit: `KB` or `MB` |

Minimum target size is 50 KB.

## Example Request

Basic multi-image PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

With file size target:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

One PDF per image:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Example Response (Collated)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Example Response (Non-Collated)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Example Response (With Target Size)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notes

- Images are centered on the page and scaled to fit within the margins while preserving aspect ratio. Images are never upscaled.
- When `collate` is `false`, each image becomes a separate PDF file, and the download is a ZIP archive containing all PDFs.
- The target size feature uses iterative binary search over JPEG quality levels (10-95) to find the best quality that fits within the budget.
- Transparent images are flattened to white before embedding in the PDF.
- Supported input formats: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG, and more.
- EXIF orientation is auto-applied before embedding.
