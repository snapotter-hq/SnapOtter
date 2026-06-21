---
description: Add text watermarks with configurable position, opacity, rotation, and tiling.
---

# Text Watermark

Add a text watermark overlay to images. Supports single placement at corners/center or tiled repetition across the entire image, with configurable font size, color, opacity, and rotation.

## API Endpoint

`POST /api/v1/tools/image/watermark-text`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Watermark text (1 to 500 characters) |
| fontSize | number | No | `48` | Font size in pixels (8 to 1000) |
| color | string | No | `"#000000"` | Text color in hex format (`#RRGGBB`) |
| opacity | number | No | `50` | Text opacity percentage (0 to 100) |
| position | string | No | `"center"` | Placement: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | Text rotation angle in degrees (-360 to 360) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Tiled watermark across the entire image:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes

- The watermark is rendered as SVG text and composited onto the image, preserving output quality.
- Tiled mode spaces text elements based on font size (6x horizontal, 4x vertical spacing), capped at 500 elements maximum.
- For corner positions, padding from the edge equals the font size.
- The font used is the system's default sans-serif font.
- XML-special characters in the text (`&`, `<`, `>`, `"`, `'`) are safely escaped.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
