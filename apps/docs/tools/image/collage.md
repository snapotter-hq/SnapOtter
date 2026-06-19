# Collage / Grid

Combine multiple images into beautiful grid collages with 25+ templates. Supports 2-9 image layouts with customizable gap, corner radius, background color, and per-cell pan/zoom controls.

## API Endpoint

`POST /api/v1/tools/collage`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Yes | - | Template layout ID (e.g. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | No | - | Per-cell settings array with `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Yes | - | Index of the image to place in this cell (0-based) |
| cells[].panX | number | No | 0 | Horizontal pan offset (-100 to 100) |
| cells[].panY | number | No | 0 | Vertical pan offset (-100 to 100) |
| cells[].zoom | number | No | 1 | Zoom level (1 to 10) |
| cells[].objectFit | string | No | `"cover"` | How image fills cell: `cover` or `contain` |
| gap | number | No | 8 | Gap between cells in pixels (0 to 500) |
| cornerRadius | number | No | 0 | Corner radius for each cell in pixels (0 to 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Background color as hex or `"transparent"` |
| aspectRatio | string | No | `"free"` | Canvas aspect ratio: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | No | `"png"` | Output format: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Output quality (1 to 100) |

## Available Templates

| Template ID | Images | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | Two equal columns |
| `2-v-equal` | 2 | Two equal rows |
| `2-h-left-large` | 2 | Left 2/3, right 1/3 |
| `2-h-right-large` | 2 | Left 1/3, right 2/3 |
| `3-left-large` | 3 | Large left, two stacked right |
| `3-right-large` | 3 | Two stacked left, large right |
| `3-top-large` | 3 | Large top, two columns bottom |
| `3-h-equal` | 3 | Three equal columns |
| `3-v-equal` | 3 | Three equal rows |
| `4-grid` | 4 | 2x2 grid |
| `4-left-large` | 4 | Large left, three stacked right |
| `4-top-large` | 4 | Large top, three columns bottom |
| `4-bottom-large` | 4 | Three columns top, large bottom |
| `5-top2-bottom3` | 5 | Two top, three bottom |
| `5-top3-bottom2` | 5 | Three top, two bottom |
| `5-left-large` | 5 | Large left, four stacked right |
| `5-center-large` | 5 | Large center, four corners |
| `6-grid-2x3` | 6 | 2 columns x 3 rows |
| `6-grid-3x2` | 6 | 3 columns x 2 rows |
| `6-top-large` | 6 | Large top, five columns bottom |
| `7-mosaic` | 7 | Mosaic layout |
| `8-mosaic` | 8 | Mosaic layout |
| `9-grid` | 9 | 3x3 grid |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notes

- Upload multiple image files in the multipart request. The images are assigned to template cells in upload order.
- If more images are uploaded than the template supports, extra images are ignored.
- Supports HEIC, RAW, PSD, and SVG input formats (automatically decoded).
- The canvas base size is 2400px on the longest side, scaled by the chosen aspect ratio.
- When `aspectRatio` is `"free"`, the canvas defaults to 4:3 (2400x1800).
- Per-cell `panX`/`panY` values shift the crop window within the cell. A value of 100 moves fully to one edge, -100 to the other.
- The `"transparent"` background color is only preserved with `png`, `webp`, or `avif` output formats.
