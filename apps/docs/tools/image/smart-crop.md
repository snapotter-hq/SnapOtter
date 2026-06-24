# Smart Crop

Smart subject-aware, face-aware, or trim-based cropping. Uses Sharp's attention/entropy strategies and AI face detection for intelligent framing.

## API Endpoint

`POST /api/v1/tools/image/smart-crop`

**Processing:** Asynchronous (returns 202, poll `/api/v1/jobs/{jobId}/progress` for status via SSE)

**Model bundle:** `face-detection` (200-300 MB) - required only for `face` mode

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| mode | string | No | `"subject"` | Crop mode: `subject`, `face`, `trim`. (Legacy values `attention` and `content` map to `subject` and `trim`) |
| strategy | string | No | `"attention"` | Strategy for subject mode: `attention` or `entropy` |
| width | integer | No | - | Target width in pixels |
| height | integer | No | - | Target height in pixels |
| padding | integer | No | `0` | Padding percentage around subject (0-50) |
| facePreset | string | No | `"head-shoulders"` | Face framing preset: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | Face detection sensitivity (0-1) |
| threshold | integer | No | `30` | Trim mode threshold for background detection (0-255) |
| padToSquare | boolean | No | `false` | Pad trimmed result to a square |
| padColor | string | No | `"#ffffff"` | Background color for padding |
| targetSize | integer | No | - | Target size for padded output (pixels) |
| quality | integer | No | - | Output quality (1-100) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Final Result (via SSE)

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes

### Subject Mode
Uses Sharp's attention or entropy strategy to find the most visually interesting region and crops around it.

### Face Mode
Detects faces using AI, then frames the crop around detected faces using the specified `facePreset`. Falls back to subject mode (attention strategy) if no faces are detected.

### Trim Mode
Removes uniform borders/background from the image. Optionally pads the result to a square with a specified background color and target size.

## Notes

- This tool uses the `createToolRoute` factory with `executionHint: "long"`, so it returns 202 with SSE progress.
- Face mode requires the `face-detection` model bundle (200-300 MB).
- Subject and trim modes work without any AI model bundle.
- The `facePreset` determines how tightly the crop frames detected faces: `closeup` is the tightest, `half-body` is the widest.
- If no width/height are specified, defaults to 1080x1080.
