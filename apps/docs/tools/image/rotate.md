---
description: Rotate images by any angle and flip horizontally or vertically.
---

# Rotate & Flip {#rotate-flip}

Rotate images by an arbitrary angle and/or flip them horizontally or vertically. Rotation and flip operations can be combined in a single request.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | Rotation angle in degrees (clockwise). Accepts any numeric value. |
| horizontal | boolean | No | `false` | Flip the image horizontally (mirror) |
| vertical | boolean | No | `false` | Flip the image vertically |

## Example Request {#example-request}

Rotate 90 degrees clockwise:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Flip horizontally:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Rotate and flip together:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- Rotation is applied first, then flip operations.
- Non-90-degree rotations (e.g. 45 degrees) will enlarge the canvas to fit the rotated image, with transparent or black fill depending on the output format.
- Common values: 90, 180, 270 for quarter-turn rotations.
- EXIF orientation is auto-applied before processing, so the rotation is relative to the visual orientation.
