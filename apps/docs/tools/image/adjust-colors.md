---
description: Adjust brightness, contrast, saturation, temperature, hue, channels, and apply color effects.
---

# Adjust Colors

Comprehensive color adjustment tool combining brightness, contrast, exposure, saturation, temperature, tint, hue rotation, per-channel levels, and one-click effects (grayscale, sepia, invert) in a single endpoint.

## API Endpoint

`POST /api/v1/tools/image/adjust-colors`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Brightness adjustment (-100 to 100) |
| contrast | number | No | `0` | Contrast adjustment (-100 to 100) |
| exposure | number | No | `0` | Exposure / midtone gamma (-100 to 100) |
| saturation | number | No | `0` | Color saturation (-100 to 100) |
| temperature | number | No | `0` | White balance: cool/blue to warm/orange (-100 to 100) |
| tint | number | No | `0` | Tint shift: green to magenta (-100 to 100) |
| hue | number | No | `0` | Hue rotation in degrees (-180 to 180) |
| sharpness | number | No | `0` | Sharpening strength (0 to 100) |
| red | number | No | `100` | Red channel level (0 to 200, 100 = unchanged) |
| green | number | No | `100` | Green channel level (0 to 200, 100 = unchanged) |
| blue | number | No | `100` | Blue channel level (0 to 200, 100 = unchanged) |
| effect | string | No | `"none"` | Color effect: `none`, `grayscale`, `sepia`, `invert` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Apply a warm vintage look:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes

- All parameters default to neutral values so you can adjust only what you need.
- Adjustments are applied in this order: brightness, contrast, exposure, saturation/hue, temperature/tint, sharpness, channels, effects.
- Temperature uses a 3x3 color recombination matrix on the blue-orange and green-magenta axes.
- Exposure maps to Sharp's gamma function (positive brightens midtones, negative darkens them).
- This endpoint also responds at the legacy paths `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels`, and `/api/v1/tools/image/color-effects`. All use the same schema.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
