# Image Splitting

Split a single image into grid tiles by column/row count or by specific pixel dimensions. Returns a ZIP archive containing all tiles.

## API Endpoint

`POST /api/v1/tools/split`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | Number of columns to split into (1 to 100) |
| rows | integer | No | 3 | Number of rows to split into (1 to 100) |
| tileWidth | integer | No | - | Tile width in pixels (min 10). Overrides `columns` when both `tileWidth` and `tileHeight` are set. |
| tileHeight | integer | No | - | Tile height in pixels (min 10). Overrides `rows` when both `tileWidth` and `tileHeight` are set. |
| outputFormat | string | No | `"original"` | Output format for tiles: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Output quality for lossy formats (1 to 100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response

The response is streamed directly as a ZIP file with `Content-Type: application/zip`. The filename follows the pattern `split-<jobId>.zip`.

Each tile inside the ZIP is named `<originalBaseName>_r<row>_c<col>.<ext>` (e.g. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notes

- Accepts a single image file.
- Supports HEIC, RAW, PSD, and SVG input formats (automatically decoded).
- When both `tileWidth` and `tileHeight` are provided, they take priority over `columns`/`rows`. The grid dimensions are calculated as `ceil(imageWidth / tileWidth)` and `ceil(imageHeight / tileHeight)`.
- Edge tiles (rightmost column, bottom row) may be smaller than the specified tile size if the image dimensions are not evenly divisible.
- Maximum grid size is capped at 100x100 (10,000 tiles).
- The response streams the ZIP directly, so there is no JSON response body. Use `--output` with curl to save the file.
