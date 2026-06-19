# Image Enhancement

One-click auto-improve with smart analysis. Analyzes the image and applies exposure, contrast, white balance, saturation, sharpness, and denoising corrections.

## API Endpoint

`POST /api/v1/tools/image-enhancement`

**Processing:** Synchronous (uses `createToolRoute` factory, returns result directly)

**Model bundle:** None required for basic enhancement. The `upscale-enhance` bundle (4-5 GB) is used only when `deepEnhance` is enabled (for AI noise removal via SCUNet).

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| mode | string | No | `"auto"` | Enhancement mode: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | No | `50` | Overall enhancement intensity (0-100) |
| corrections | object | No | all `true` | Selective corrections to apply (see below) |
| deepEnhance | boolean | No | `false` | Enable AI-powered noise removal (requires `noise-removal` tool installed) |

### Corrections Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Auto-correct exposure |
| contrast | boolean | `true` | Auto-correct contrast |
| whiteBalance | boolean | `true` | Auto-correct white balance |
| saturation | boolean | `true` | Auto-correct saturation |
| sharpness | boolean | `true` | Auto-sharpen |
| denoise | boolean | `true` | Light denoising |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Response (200 OK)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze Endpoint

`POST /api/v1/tools/image-enhancement/analyze`

Analyzes an image and returns correction recommendations without applying them.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | file | Yes | Image file (multipart) |

### Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Response (200 OK)

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Notes

- This tool uses the synchronous `createToolRoute` factory, so it returns a standard response (not 202 async).
- The `mode` parameter adjusts how corrections are weighted (e.g., portrait mode is gentler on skin tones, landscape mode boosts saturation).
- When `deepEnhance` is enabled and the `noise-removal` tool (SCUNet) is installed, an additional AI denoising pass is applied after the standard corrections.
- The analyze endpoint is useful for previewing what corrections would be applied before committing.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
