---
description: Minify SVG files with svgo and keep the result as a vector SVG, with precision, multipass, metadata and formatting controls.
---

# Optimize SVG {#optimize-svg}

Shrink SVG files by removing editor cruft, redundant attributes and excess decimal places, then download the result as an SVG. Unlike Optimize for Web, the output is never rasterized.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Accepts multipart form data with an `.svg` or `.svgz` file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | Decimal places kept in path data and numbers (0 to 8). Lower values give smaller files and slightly coarser curves. |
| multipass | boolean | No | `true` | Run the optimizer repeatedly until the output stops shrinking |
| removeMetadata | boolean | No | `true` | Remove comments, `<metadata>`, empty or editor-generated `<desc>` elements and editor-specific data. Turn it off to keep them. |
| pretty | boolean | No | `false` | Indent the output for readability instead of minifying it onto few lines |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- Input must be an SVG or SVGZ file. A raster image is rejected with a `400` and the code `IMAGE_UNDECODABLE`.
- `.svgz` input is inflated first, and the output is always a plain `.svg`.
- The SVG is limited to 2 MB after inflation. A larger file is rejected with a `400` and the code `SVG_TOO_LARGE`.
- The `viewBox` and `<title>` are always kept, so the graphic still scales and keeps its accessible name.
- Input and output both pass through the SVG sanitizer, which strips scripts and other active content.
- Lowering `precision` is the biggest size saver for path-heavy artwork. Check the result visually at 0 to 2.
