---
description: Pad an image to a target aspect ratio with a solid color, transparent, or blurred background.
---

# Image Pad {#image-pad}

Pad an image to a target aspect ratio by adding a solid color, transparent, or blurred background around it. Useful for fitting images into fixed aspect ratios for social media or print without cropping.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"1:1"` | Target aspect ratio: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, or `custom` |
| ratioW | integer | No | `1` | Custom ratio width (1-100, used when target is `custom`) |
| ratioH | integer | No | `1` | Custom ratio height (1-100, used when target is `custom`) |
| background | string | No | `"color"` | Background mode: `color`, `transparent`, or `blur` |
| color | string | No | `"#ffffff"` | Background hex color (when background is `color`) |
| padding | integer | No | `0` | Extra padding as percentage of canvas (0-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notes {#notes}

- The `blur` background mode creates a blurred copy of the original image as the pad fill, producing a visually cohesive result.
- When using `transparent` background, the output is converted to PNG to preserve alpha.
- Output format matches the input format unless transparency is involved. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
- Set `target` to `custom` and provide `ratioW` and `ratioH` for arbitrary aspect ratios (e.g., `ratioW: 3, ratioH: 2` for 3:2).
