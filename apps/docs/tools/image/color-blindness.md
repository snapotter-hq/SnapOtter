---
description: Simulate how images appear to people with different types of color vision deficiency.
---

# Color Blindness Simulation {#color-blindness-simulation}

Simulate color vision deficiency (CVD) to preview how images appear to people with various types of color blindness. Useful for accessibility testing of designs, charts, and UI.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | Type of color vision deficiency to simulate |

### Simulation Types {#simulation-types}

| Value | Condition | Description |
|-------|-----------|-------------|
| `protanopia` | Red-blind | Complete absence of red cone cells |
| `deuteranopia` | Green-blind | Complete absence of green cone cells |
| `tritanopia` | Blue-blind | Complete absence of blue cone cells |
| `protanomaly` | Red-weak | Reduced red cone sensitivity |
| `deuteranomaly` | Green-weak | Reduced green cone sensitivity (most common) |
| `tritanomaly` | Blue-weak | Reduced blue cone sensitivity |
| `achromatopsia` | Total color blind | Complete absence of color vision |
| `blueConeMonochromacy` | Blue-cone only | Only blue cones functional |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notes {#notes}

- Deuteranomaly (green-weak) is the default because it is the most common form of color vision deficiency, affecting approximately 6% of males.
- The simulation uses color transformation matrices that model how reduced or absent cone photoreceptors alter perceived colors.
- This tool is non-destructive and produces a preview only. It does not modify the original image for accessibility.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
