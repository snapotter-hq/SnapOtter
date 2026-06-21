---
description: Add styled text overlays with drop shadows and background boxes.
---

# Text Overlay

Add styled text to images with optional drop shadow and semi-transparent background box. Suitable for titles, captions, or annotations on photos.

## API Endpoint

`POST /api/v1/tools/image/text-overlay`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Text to overlay (1 to 500 characters) |
| fontSize | number | No | `48` | Font size in pixels (8 to 200) |
| color | string | No | `"#FFFFFF"` | Text color in hex format (`#RRGGBB`) |
| position | string | No | `"bottom"` | Vertical placement: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | Show a semi-transparent background rectangle behind the text |
| backgroundColor | string | No | `"#000000"` | Background box color in hex format (`#RRGGBB`) |
| shadow | boolean | No | `true` | Apply a drop shadow behind the text |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

With a background box:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes

- Text is always centered horizontally within the image.
- The drop shadow uses a 2px offset with 3px blur at 70% black opacity.
- The background box spans the full image width at 70% opacity, with height proportional to the font size (1.8x).
- Text is rendered via SVG composite, so the system's default sans-serif font is used.
- XML-special characters in the text are safely escaped.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
