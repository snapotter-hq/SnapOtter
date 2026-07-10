---
description: Extract dominant colors from an image as a color palette.
---

# Color Palette {#color-palette}

Extract the dominant colors from an image and return them as hex color values. Uses quantized frequency analysis to identify the most prominent and visually distinct colors.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Accepts multipart form data with an image file and an optional JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| count | integer | No | `8` | Number of colors to extract (2-16) |
| format | string | No | `"hex"` | Color format: `hex`, `rgb`, `hsl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Example Response {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Sanitized filename |
| colors | array | Array of color strings in the requested format, ordered by dominance (most frequent first) |
| hex | array | Array of hex color strings (always hex, regardless of the `format` setting) |
| count | number | Number of colors extracted |

## Notes {#notes}

- Returns up to `count` dominant colors (default 8, range 2-16), sorted by frequency (most common first).
- The image is internally resized to 100x100 pixels for analysis, so the palette represents overall color distribution rather than small details.
- Colors are extracted using median-cut quantization, which recursively splits pixel populations along the channel with the widest range.
- The alpha channel is removed before analysis, so transparent areas are not considered.
- This is a read-only endpoint. It does not produce a downloadable output file or a `jobId`.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before analysis.
