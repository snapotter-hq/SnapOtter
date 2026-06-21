---
description: Sharpen images using adaptive, unsharp mask, or high-pass methods with optional noise reduction.
---

# Sharpening

Advanced sharpening tool with three methods: adaptive (smart edge-aware), unsharp mask (classic radius/amount), and high-pass (texture emphasis). Includes built-in noise reduction to prevent sharpening artifacts.

## API Endpoint

`POST /api/v1/tools/image/sharpening`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | Sharpening algorithm: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | Adaptive: Gaussian sigma (0.5 to 10) |
| m1 | number | No | `1.0` | Adaptive: flat area sharpening (0 to 10) |
| m2 | number | No | `3.0` | Adaptive: jagged area sharpening (0 to 20) |
| x1 | number | No | `2.0` | Adaptive: flat/jagged threshold (0 to 10) |
| y2 | number | No | `12` | Adaptive: maximum flat sharpening (0 to 50) |
| y3 | number | No | `20` | Adaptive: maximum jagged sharpening (0 to 50) |
| amount | number | No | `100` | Unsharp mask: sharpening amount (0 to 1000) |
| radius | number | No | `1.0` | Unsharp mask: blur radius in pixels (0.1 to 5) |
| threshold | number | No | `0` | Unsharp mask: minimum brightness difference to sharpen (0 to 255) |
| strength | number | No | `50` | High-pass: filter strength (0 to 100) |
| kernelSize | number | No | `3` | High-pass: convolution kernel size (3 or 5) |
| denoise | string | No | `"off"` | Pre-sharpening noise reduction: `off`, `light`, `medium`, `strong` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Unsharp mask with threshold to protect smooth areas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes

- Only parameters relevant to the chosen method are used. For example, `amount`, `radius`, and `threshold` are ignored when `method` is `adaptive`.
- The adaptive method uses Sharp's built-in adaptive sharpening with configurable flat/jagged region behavior.
- The `denoise` option applies noise reduction before sharpening to prevent amplification of noise/grain.
- High-pass sharpening extracts fine detail by subtracting a blurred version from the original, then blending back.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
