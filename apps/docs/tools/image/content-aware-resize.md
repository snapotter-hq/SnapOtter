---
description: Seam-carving resize that adds or removes pixels along low-importance paths to preserve key content and faces.
---

# Content-Aware Resize {#content-aware-resize}

Seam carving resize that intelligently removes or adds pixels along paths of least visual importance, preserving important content and optionally protecting faces.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Processing:** Synchronous (returns result directly)

**Model bundle:** None required for basic operation. Face protection uses the `face-detection` bundle (200-300 MB) if enabled.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| width | number | No | - | Target width in pixels |
| height | number | No | - | Target height in pixels |
| protectFaces | boolean | No | `false` | Detect and protect faces from seam removal |
| blurRadius | number | No | `4` | Pre-processing blur radius for energy calculation (0-20) |
| sobelThreshold | number | No | `2` | Sobel edge detection threshold (1-20). Higher values make the algorithm more aggressive |
| square | boolean | No | `false` | Resize to a square (uses the smaller dimension) |

At least one of `width`, `height`, or `square` must be specified.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notes {#notes}

- This custom route currently returns a synchronous 200 response.
- Uses the `caire` seam carving library for content-aware resizing.
- Only reduces dimensions (removes seams). Cannot expand an image beyond its original size.
- The `protectFaces` option uses AI face detection to mark face regions as high-energy, preventing seams from passing through faces.
- `blurRadius` controls smoothing before energy map calculation. Higher values make the energy map more uniform, which can help with noisy images.
- `sobelThreshold` affects how aggressively edges are detected. Lower values preserve more subtle edges.
- Output is always PNG format.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
