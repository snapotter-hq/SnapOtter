---
description: Generate QR codes with custom colors and error correction levels.
---

# QR Code Generator {#qr-code-generator}

Generate QR code images from text or URLs with configurable size, error correction level, and custom foreground/background colors.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Accepts a **JSON body** (not multipart). No file upload is needed.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Content to encode in the QR code (1 to 2000 characters) |
| size | number | No | `400` | Output image width/height in pixels (100 to 10000) |
| errorCorrection | string | No | `"M"` | Error correction level: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | QR code foreground/module color in hex (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | QR code background color in hex (`#RRGGBB`) |
| logoDataUri | string | No | - | Logo image as a data URI (`data:image/png;base64,...` or `data:image/jpeg;base64,...`, max 700 KB). Centered on the QR code at 22% of the QR size. Forces error correction to `H` |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | Maximum data density |
| `M` | ~15% | Balanced (default) |
| `Q` | ~25% | Good for printed codes |
| `H` | ~30% | Best for codes with logos overlay |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Branded QR code with custom colors:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- This endpoint accepts JSON, not multipart form data, since no image upload is needed.
- The output is always a PNG image.
- The output filename is always `qrcode.png`.
- `originalSize` is always 0 since this tool generates images from scratch.
- A 2-module quiet zone (margin) is included around the QR code.
- Maximum text length is 2000 characters. Actual capacity depends on error correction level and character encoding.
- Higher error correction levels allow the QR code to remain scannable even if partially obscured but reduce data capacity.
- When a `logoDataUri` is provided, error correction is automatically forced to `H` (30%) so the QR code remains scannable despite the logo occluding the center.
