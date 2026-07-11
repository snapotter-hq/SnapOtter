---
description: AI-powered passport and ID photo generator with face detection, background removal, and print sheet tiling.
---

# Passport Photo {#passport-photo}

AI-powered passport and ID photo generator. Two-phase workflow: analyze (face detection + background removal) then generate (crop, resize, and tile for printing).

## API Endpoints {#api-endpoints}

This tool uses a two-phase flow with separate endpoints for analysis and generation.

**Model bundles:** `background-removal` and `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Detects face landmarks and removes the background. Returns landmark data and a preview for the frontend to display a crop preview.

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| clientJobId | string | No | - | Optional job ID for progress tracking via SSE |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progress (SSE, optional) {#progress-sse-optional}

If `clientJobId` is provided, progress is streamed (0-30% for face detection, 30-95% for background removal).

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Crops, resizes, and optionally tiles the photo onto a print sheet. Uses cached images from Phase 1 (no AI re-run).

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | Job ID from Phase 1 |
| filename | string | Yes | - | Original filename from Phase 1 |
| countryCode | string | Yes | - | Country code for passport spec (e.g., `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | Document type (from country spec) |
| bgColor | string | No | `"#FFFFFF"` | Background color hex |
| printLayout | string | No | `"none"` | Print paper layout: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | Max file size constraint in KB (0 = no limit) |
| dpi | number | No | `300` | Output DPI (72-1200) |
| customWidthMm | number | No | - | Custom photo width in mm (overrides country spec) |
| customHeightMm | number | No | - | Custom photo height in mm (overrides country spec) |
| zoom | number | No | `1` | Zoom factor (0.5-3). Values > 1 crop tighter |
| adjustX | number | No | `0` | Horizontal position adjustment |
| adjustY | number | No | `0` | Vertical position adjustment |
| landmarks | object | Yes | - | Landmarks object from Phase 1 response |
| imageWidth | number | Yes | - | Image width from Phase 1 response |
| imageHeight | number | Yes | - | Image height from Phase 1 response |

#### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Response (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

Returns guidance to use the correct sub-endpoint.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- Requires the `background-removal` and `face-detection` model bundles to be installed.
- Phase 1 runs AI (face landmarks + background removal) and caches results. Phase 2 is pure Sharp image manipulation (fast, no AI needed).
- Landmarks are returned as normalized coordinates (0-1 range relative to image dimensions).
- The `preview` field in the analyze response is a base64-encoded PNG (max 800px wide) for fast display.
- Country specs include document dimensions, head height ratios, and eye-line positioning based on official passport photo requirements.
- The `printLayout` option generates a tiled sheet on 4x6" or A4 paper with 2mm gutters between photos.
- When `maxFileSizeKb` is set, the output is iteratively compressed to fit within the size limit.
