---
description: Generate a tiny low-quality image placeholder with base64 data URI.
---

# LQIP Placeholder {#lqip-placeholder}

Generate a tiny low-quality image placeholder (LQIP) from a source image. Returns a small placeholder file along with a base64 data URI, ready-to-use HTML `<img>` tag, and CSS `background-image` snippet for immediate embedding.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `16` | Target width in pixels (4-64) |
| blur | number | No | `2` | Blur radius for the blur strategy (0-20) |
| strategy | string | No | `"blur"` | Placeholder strategy: `blur`, `pixelate`, or `solid` |
| format | string | No | `"webp"` | Output format: `webp`, `png`, or `jpeg` |
| quality | integer | No | `50` | Output quality (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notes {#notes}

- The `dataUri` field contains the complete data URI, ready for use in `src` attributes or CSS without any additional requests.
- The `html` and `css` fields provide copy-paste snippets for common use cases.
- The `blur` strategy produces a soft, blurred thumbnail. The `pixelate` strategy creates a blocky mosaic. The `solid` strategy returns a single averaged color.
- Typical placeholder sizes are 200-500 bytes, making them suitable for inlining directly in HTML.
- Height is calculated automatically to preserve the source image's aspect ratio.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
