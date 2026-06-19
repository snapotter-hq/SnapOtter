---
description: Compare two images side by side with pixel-level diff visualization and similarity score.
---

# Image Compare

Upload two images to compute a pixel-level difference map and a numerical similarity percentage. The output is a diff image highlighting changed regions in red.

## API Endpoint

`POST /api/v1/tools/compare`

Accepts multipart form data with **two** image files. No settings field is needed.

## Parameters

This tool has no configurable parameters. Upload exactly two image files.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file (first) | file | Yes | The first image |
| file (second) | file | Yes | The second image |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| jobId | string | Job identifier for downloading the diff image |
| similarity | number | Percentage similarity between the two images (0 to 100) |
| dimensions | object | Width and height used for comparison |
| downloadUrl | string | URL to download the generated diff image |
| originalSize | number | Combined size of both input images in bytes |
| processedSize | number | Size of the diff output image in bytes |

## Notes

- Both images are resized to the same dimensions (the maximum of each axis) before comparison.
- The diff image highlights differences in red with opacity proportional to the magnitude of change. Identical or near-identical pixels (difference < 10) are shown as semi-transparent versions of the original.
- Similarity is calculated as the inverse of the average pixel difference across all pixels, expressed as a percentage.
- A similarity of 100% means the images are pixel-identical (at the comparison resolution).
- The diff output is always PNG format regardless of input formats.
- Both images are validated and decoded (HEIC, RAW, PSD, SVG supported) before comparison.
- EXIF orientation is auto-applied on both images before processing.
