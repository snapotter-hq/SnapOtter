---
description: Apply a two-color duotone effect with custom shadow and highlight colors.
---

# Duotone

Apply a two-color duotone effect to an image. The image is converted to grayscale, then mapped to a gradient between the shadow color (dark tones) and the highlight color (bright tones).

## API Endpoint

`POST /api/v1/tools/duotone`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | Shadow hex color (applied to dark tones) |
| highlight | string | No | `"#fbbf24"` | Highlight hex color (applied to bright tones) |
| intensity | integer | No | `100` | Effect intensity (0-100); 0 returns the original, 100 applies the full duotone |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notes

- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
- An `intensity` of less than 100 blends the duotone result with the original image, allowing for subtler effects.
- Popular duotone combinations include navy/gold, teal/coral, and purple/pink.
