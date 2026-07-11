---
description: Replace a specific color in an image with another color or make it transparent.
---

# Replace & Invert Color {#replace-invert-color}

Replace pixels matching a source color with a target color, or make them transparent. Uses Euclidean distance in RGB space with configurable tolerance for smooth blending at color boundaries.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | Hex color to find (format: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | Hex color to replace with (format: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | Make matching pixels transparent instead of replacing with target color |
| tolerance | number | No | `30` | Color matching tolerance (0 to 255). Higher values match a wider range of similar colors |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Make a green background transparent:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- Color matching uses Euclidean distance in RGB space, scaled by `tolerance * sqrt(3)`.
- Replacement blending is proportional to color distance: pixels closer to the source color receive more of the target color, creating smooth transitions.
- When `makeTransparent` is `true`, the output is forced to PNG (or WebP/AVIF) if the input format does not support alpha channels (e.g., JPEG).
- A tolerance of 0 matches only the exact source color. Higher values (50+) will match a broader range of similar hues.
- Output format matches the input format unless transparency is needed and the input format lacks alpha support.
