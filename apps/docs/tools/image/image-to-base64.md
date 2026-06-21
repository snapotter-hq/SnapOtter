---
description: Convert images to base64 data URIs for embedding in HTML, CSS, and more.
---

# Image to Base64

Convert one or more images to base64-encoded strings and data URIs. Supports optional format conversion, quality control, and resizing. Useful for embedding images directly in HTML, CSS, JSON, or email templates.

## API Endpoint

`POST /api/v1/tools/image/image-to-base64`

Accepts multipart form data with one or more image files and an optional JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"original"` | Convert before encoding: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | No | `80` | Output quality for lossy formats (1 to 100) |
| maxWidth | number | No | `0` | Maximum width in pixels (0 = no resize, will not enlarge) |
| maxHeight | number | No | `0` | Maximum height in pixels (0 = no resize, will not enlarge) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Multiple files:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Example Response

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| results | array | Successfully converted images |
| errors | array | Images that failed to process (with filename and error message) |

### Result Object

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Original filename |
| mimeType | string | MIME type of the encoded output |
| width | number | Final width in pixels (after any resizing) |
| height | number | Final height in pixels (after any resizing) |
| originalSize | number | Original file size in bytes |
| encodedSize | number | Size of the base64 string in bytes |
| overheadPercent | number | Percentage size difference vs original (positive = larger, negative = smaller) |
| base64 | string | Raw base64-encoded image data |
| dataUri | string | Complete data URI ready for use in `src` attributes |

## Notes

- Base64 encoding typically increases size by approximately 33% compared to the binary file. The `overheadPercent` field shows the actual difference.
- When `outputFormat` is `"original"`, HEIC/HEIF files are converted to JPEG (since browsers cannot display HEIC in data URIs).
- The `maxWidth` and `maxHeight` options resize using `fit: inside` with `withoutEnlargement`, so images smaller than the specified dimensions are not upscaled.
- Multiple files can be processed in a single request. Each file is processed independently, and failures do not prevent other files from succeeding.
- SVG files are passed through as `image/svg+xml` without re-encoding (unless a format conversion is requested).
- This is a read-only endpoint. It does not produce a downloadable file or a `jobId`. The base64 data is returned directly in the response body.
