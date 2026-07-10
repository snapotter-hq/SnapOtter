---
description: Add borders, padding, rounded corners, and drop shadows to images in a predictable, controllable order.
---

# Border & Frame {#border-frame}

Add borders, padding, rounded corners, and drop shadows to images. The tool applies effects in order: padding, border, corner radius, then shadow.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | Border thickness in pixels (0 to 2000) |
| borderColor | string | No | `"#000000"` | Border color as hex (e.g. `#FF0000`) |
| padding | number | No | 0 | Inner padding between image and border in pixels (0 to 200) |
| paddingColor | string | No | `"#FFFFFF"` | Padding fill color as hex |
| cornerRadius | number | No | 0 | Corner radius in pixels (0 to 2000) |
| shadow | boolean | No | `false` | Whether to add a drop shadow |
| shadowBlur | number | No | 15 | Shadow blur radius (1 to 200) |
| shadowOffsetX | number | No | 0 | Shadow horizontal offset (-50 to 50) |
| shadowOffsetY | number | No | 5 | Shadow vertical offset (-50 to 50) |
| shadowColor | string | No | `"#000000"` | Shadow color as hex |
| shadowOpacity | number | No | 40 | Shadow opacity percentage (0 to 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- Uses the standard `createToolRoute` factory. Accepts a single image file via multipart upload.
- Supports HEIC, RAW, PSD, and SVG input formats (automatically decoded).
- Processing order: padding is added first, then the border wraps around, then corner radius is applied, then the shadow is composited.
- When `cornerRadius` or `shadow` is enabled, the output is forced to PNG (regardless of input format) to preserve transparency. Formats that support alpha (PNG, WebP, AVIF) keep their original format.
- The shadow is shape-aware: it follows the rounded corners rather than creating a rectangular shadow.
- Setting `borderWidth` to 0 and using only `cornerRadius` + `shadow` creates a frameless rounded shadow effect.
