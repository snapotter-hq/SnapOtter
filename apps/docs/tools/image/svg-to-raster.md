# SVG to Raster

Convert SVG files to raster image formats (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, or JXL) at custom resolution and DPI. Also supports batch conversion of multiple SVGs.

## API Endpoint

`POST /api/v1/tools/svg-to-raster`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Target width in pixels (1 to 65536). Maintains aspect ratio if only one dimension set. |
| height | integer | No | - | Target height in pixels (1 to 65536). Maintains aspect ratio if only one dimension set. |
| dpi | integer | No | 300 | Render DPI, controls the base rasterization density (36 to 2400) |
| quality | number | No | 90 | Output quality for lossy formats (1 to 100) |
| backgroundColor | string | No | `"#00000000"` | Background color as hex (6 or 8 characters, 8-char includes alpha) |
| outputFormat | string | No | `"png"` | Output format: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint

`POST /api/v1/tools/svg-to-raster/batch`

Convert multiple SVG files in one request. Returns a ZIP archive.

### Additional Batch Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | Optional client-provided job ID for progress tracking (max 128 chars) |

### Batch Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response

The batch endpoint streams a ZIP file directly with headers:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes

- Only accepts SVG and SVGZ files (validates content, not just extension). SVGZ is automatically decompressed.
- SVG content is sanitized before rendering to prevent XSS and external resource loading.
- The `dpi` setting controls the density at which the SVG is rasterized. Higher DPI produces larger pixel dimensions from the same SVG viewport.
- When both `width` and `height` are provided, the image is resized using `fit: inside` (maintains aspect ratio within the bounds).
- A `previewUrl` is included in the response for formats that browsers cannot display natively (TIFF, HEIF). The preview is a 1200px WebP thumbnail.
- The default background `#00000000` is fully transparent. Set to `#FFFFFF` for a white background (useful with JPEG output which does not support transparency).
- Batch processing respects the `MAX_BATCH_SIZE` server configuration and uses concurrent workers for performance.
- Progress for batch operations can be tracked via SSE at `/api/v1/jobs/:jobId/progress`.
