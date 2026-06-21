---
description: Combine multiple images into a single sprite sheet grid with frame metadata.
---

# Sprite Sheet

Combine multiple images into a single sprite sheet grid. Each image is resized to match the first image's dimensions and placed into the grid. Returns the sprite sheet image along with per-frame coordinate metadata.

## API Endpoint

`POST /api/v1/tools/image/sprite-sheet`

Accepts multipart form data with two or more image files and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | Number of columns in the grid (1-16) |
| padding | integer | No | `0` | Padding between cells in pixels (0-64) |
| background | string | No | `"#ffffff"` | Background hex color |
| format | string | No | `"png"` | Output format: `png`, `webp`, or `jpeg` |
| quality | integer | No | `90` | Output quality (1-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes

- Accepts 2 to 64 images. All images are resized to match the dimensions of the first uploaded image.
- The `frames` array provides the exact pixel coordinates of each frame in the output, suitable for CSS sprite definitions or game engine frame maps.
- The number of rows is calculated automatically from the image count and `columns` value.
- Use the `padding` parameter to add spacing between cells. The `background` color is visible in padding areas and any empty trailing cells.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
