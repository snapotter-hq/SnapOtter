# Stitch / Combine

Join multiple images side by side, stacked vertically, or arranged in a grid. Supports alignment, gap, border, corner radius, and multiple resize modes.

## API Endpoint

`POST /api/v1/tools/image/stitch`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | Layout direction: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | Number of columns when direction is `grid` (2 to 100) |
| resizeMode | string | No | `"fit"` | How images are resized: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | Cross-axis alignment: `start`, `center`, `end` |
| gap | number | No | 0 | Gap between images in pixels (0 to 1000) |
| border | number | No | 0 | Outer border width in pixels (0 to 500) |
| cornerRadius | number | No | 0 | Corner radius applied to final output (0 to 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Background/border color as hex (e.g. `#FF0000`) |
| format | string | No | `"png"` | Output format: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Output quality (1 to 100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes

- Requires at least 2 images. Upload multiple image files in the multipart request.
- Supports HEIC, RAW, PSD, and SVG input formats (automatically decoded).
- Resize modes:
  - `fit` - Scale images to match the smallest dimension along the joining axis.
  - `original` - Keep original sizes (may produce uneven edges).
  - `stretch` - Force images to match the smallest dimension without preserving aspect ratio.
  - `crop` - Cover-crop images to match the smallest dimension.
- In `grid` mode, cells are sized to the median dimensions of all images.
- The `cornerRadius` is applied to the entire final output, not individual images.
- Canvas size is limited by the `MAX_CANVAS_PIXELS` server configuration to prevent memory exhaustion.
