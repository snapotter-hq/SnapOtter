---
description: Shrink PDF file size by compressing embedded images.
---

# Compress PDF {#compress-pdf}

Reduce PDF file size by downsampling embedded images. Choose between a quality slider or a target file size.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Compression mode: `quality` or `targetSize` |
| quality | integer | No | `75` | Compression quality, 1-100 (higher = less compression). Used in `quality` mode |
| targetSizeKb | number | No | - | Target file size in kilobytes. Used in `targetSize` mode |

## Example Request {#example-request}

Compress by quality:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Compress to a target size:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- In `quality` mode, lower values produce smaller files with more image degradation.
- In `targetSize` mode, a binary search finds the highest DPI that fits the requested size.
- If compression would enlarge the file, the original bytes are returned unchanged.
- Text and vector content are not affected; only embedded raster images are downsampled.
