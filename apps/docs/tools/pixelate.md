---
description: Apply a pixelation effect to the full image or a specific region.
---

# Pixelate

Apply a pixelation effect to an entire image or a specific rectangular region. Useful for obscuring sensitive content like faces, license plates, or personal information.

## API Endpoint

`POST /api/v1/tools/pixelate`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | Pixel block size (2-128); larger values produce coarser pixelation |
| region | object | No | - | Restrict pixelation to a rectangle (see below) |

### Region Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | Left offset in pixels (>= 0) |
| top | integer | Yes | Top offset in pixels (>= 0) |
| width | integer | Yes | Region width in pixels (>= 1) |
| height | integer | Yes | Region height in pixels (>= 1) |

## Example Request

Pixelate the full image:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixelate a specific region:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes

- When `region` is omitted, the entire image is pixelated.
- The region coordinates are in pixels relative to the top-left corner of the image. The region must fall within the image bounds.
- Output format matches the input format. HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
