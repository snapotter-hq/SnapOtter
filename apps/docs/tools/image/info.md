---
description: View detailed image metadata, properties, and per-channel histogram statistics.
---

# Image Info

Read-only analysis tool that returns comprehensive image metadata including dimensions, format, color space, EXIF/ICC/XMP presence, and per-channel histogram statistics. Does not produce a processed output file.

## API Endpoint

`POST /api/v1/tools/info`

Accepts multipart form data with an image file. No settings field is needed.

## Parameters

This tool has no configurable parameters. Simply upload the image file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | The image to analyze |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Sanitized filename |
| fileSize | number | File size in bytes |
| width | number | Image width in pixels |
| height | number | Image height in pixels |
| format | string | Detected format (jpeg, png, webp, etc.) |
| channels | number | Number of color channels |
| hasAlpha | boolean | Whether the image has an alpha channel |
| colorSpace | string | Color space (srgb, cmyk, etc.) |
| density | number or null | DPI/PPI resolution |
| isProgressive | boolean | Whether JPEG uses progressive encoding |
| orientation | number or null | EXIF orientation value (1-8) |
| hasProfile | boolean | Whether an ICC profile is embedded |
| hasExif | boolean | Whether EXIF metadata is present |
| hasIcc | boolean | Whether an ICC color profile is present |
| hasXmp | boolean | Whether XMP metadata is present |
| bitDepth | string or null | Bits per sample |
| pages | number | Number of pages (for multi-page formats like TIFF, GIF) |
| histogram | array | Per-channel statistics (min, max, mean, standard deviation) |

## Notes

- This is a read-only endpoint. It does not produce a downloadable output file or a `jobId`.
- For RAW format images (DNG, CR2, NEF, ARW, etc.), ExifTool is used to extract true sensor dimensions and metadata flags that Sharp cannot read directly.
- HEIC/HEIF files are decoded to PNG internally to extract pixel statistics, since Sharp cannot decode HEVC pixels.
- The histogram provides min/max/mean/stdev per channel, not a full 256-bin distribution.
- The `density` field reflects the embedded DPI metadata, if present.
