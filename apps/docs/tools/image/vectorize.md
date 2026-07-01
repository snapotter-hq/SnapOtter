---
description: Convert raster images to SVG with black-and-white (potrace) and full-color multi-layer vectorization.
---

# Image to SVG

Vectorize raster images into SVG using tracing algorithms. Supports black-and-white tracing (potrace) and full-color multi-layer vectorization.

## API Endpoint

`POST /api/v1/tools/image/vectorize`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | Tracing mode: `bw` (black and white) or `color` (multi-color layers) |
| threshold | number | No | 128 | Brightness threshold for B&W mode (0 to 255). Pixels below become black. |
| colorPrecision | number | No | 6 | Color quantization precision for color mode (1 to 16). Higher values produce more distinct color layers. |
| layerDifference | number | No | 6 | Minimum color difference between layers in color mode (1 to 128) |
| filterSpeckle | number | No | 4 | Minimum area for traced shapes in pixels (1 to 256). Removes noise/speckles. |
| pathMode | string | No | `"spline"` | Path smoothing: `none` (jagged), `polygon` (straight segments), `spline` (smooth curves) |
| cornerThreshold | number | No | 60 | Angle threshold for corner detection in color mode (0 to 180 degrees) |
| invert | boolean | No | `false` | Invert the image before tracing (swap black/white) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes

- Output is always an SVG file regardless of input format.
- Supports HEIC, RAW, PSD, and SVG input formats (automatically decoded to raster before tracing).
- B&W mode uses the potrace algorithm. The image is converted to grayscale first, then thresholded to pure black/white before tracing.
- Color mode uses a multi-layer approach: the image is quantized into color layers, each traced separately and stacked in the SVG output.
- Lower `filterSpeckle` values preserve more detail but produce larger SVG files with more paths.
- The `pathMode` setting significantly affects file size: `none` produces the most paths, `spline` produces the smoothest (and usually smallest) output.
- For best results with logos and icons, use B&W mode with a clean high-contrast input. For photographs or illustrations, use color mode with higher `colorPrecision`.
