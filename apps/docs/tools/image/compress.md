---
description: Reduce image file size by quality level or to a target file size.
---

# Compress {#compress}

Reduce image file size by specifying a quality level or a target file size in kilobytes. The tool uses iterative binary search to hit size targets accurately.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Compression mode: `quality` or `targetSize` |
| quality | number | No | `80` | Quality level (1-100). Used when mode is `quality`. |
| targetSizeKb | number | No | - | Target file size in kilobytes. Used when mode is `targetSize`. |

## Example Request {#example-request}

Compress to quality 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Compress to target size of 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notes {#notes}

- In `quality` mode, lower values produce smaller files with more compression artifacts. A value of 80 is a good default for web use.
- In `targetSize` mode, the engine performs iterative compression to get as close to the target as possible without exceeding it.
- Output format matches the input format. The compression applies to the format's native encoding (e.g. JPEG quality for JPEG files, WebP quality for WebP files).
- If the default quality (80) is acceptable, you can omit the `quality` parameter entirely.
