---
description: Add a vignette effect with adjustable strength, color, and position.
---

# Vignette

Add a vignette effect that darkens or tints the edges of an image. Supports adjustable strength, color, radius, softness, roundness, and center position.

## API Endpoint

`POST /api/v1/tools/vignette`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | Vignette opacity (0.1-1) |
| color | string | No | `"#000000"` | Vignette hex color |
| radius | integer | No | `70` | Outer radius as percentage of half-diagonal (0-100) |
| softness | integer | No | `50` | Feather softness (0-100); higher values produce a more gradual fade |
| roundness | integer | No | `100` | Shape: 100 = circle, 0 = ellipse matching image aspect ratio |
| centerX | integer | No | `50` | Horizontal center position as percentage (0-100) |
| centerY | integer | No | `50` | Vertical center position as percentage (0-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes

- A smaller `radius` darkens more of the image; a larger radius confines the vignette to the extreme edges.
- Use a non-black `color` (e.g., white or sepia tones) for creative vignette effects.
- Adjusting `centerX` and `centerY` lets you position the clear area off-center, useful for drawing focus to a subject that is not in the middle of the frame.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
