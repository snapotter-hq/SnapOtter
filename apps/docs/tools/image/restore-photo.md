# Photo Restoration

Fix scratches, tears, and damage on old photos using a multi-step AI pipeline. Combines scratch repair, face enhancement, denoising, and optional colorization.

## API Endpoint

`POST /api/v1/tools/restore-photo`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `photo-restoration` (800 MB - 1 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| scratchRemoval | boolean | No | `true` | Remove scratches and surface damage |
| faceEnhancement | boolean | No | `true` | Enhance faces in the restored photo |
| fidelity | number | No | `0.7` | Face enhancement fidelity (0-1). Higher values preserve original features more |
| denoise | boolean | No | `true` | Apply denoising to the restored result |
| denoiseStrength | number | No | `25` | Denoising strength (0-100) |
| colorize | boolean | No | `false` | Colorize the restored photo (for grayscale images) |
| colorizeStrength | number | No | `85` | Colorization intensity (0-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
```

## Response

### Initial Response (202 Accepted)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`)

```
event: progress
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes

- Requires the `photo-restoration` model bundle to be installed (800 MB - 1 GB).
- The pipeline runs multiple AI steps sequentially: scratch repair, face enhancement (GFPGAN), denoising, and optionally colorization.
- The `steps` array in the result shows which processing steps were actually executed.
- `scratchCoverage` is an estimated percentage of the image area that had scratch damage.
- `fidelity` controls how strongly faces are enhanced vs. preserving the original appearance. Lower values produce more aggressive enhancement; higher values are more conservative.
- The `colorize` option automatically detects if the image is grayscale. The `isGrayscale` flag in the result confirms this detection.
- Output format matches the input format automatically.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, HDR, and AVIF input formats via automatic decoding.
