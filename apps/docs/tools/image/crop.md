---
description: Crop images by specifying a region with position and dimensions.
---

# Crop

Crop images by defining a rectangular region using position and size. Supports both pixel and percentage units.

## API Endpoint

`POST /api/v1/tools/image/crop`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| left | number | Yes | - | X offset of the crop region (from left edge) |
| top | number | Yes | - | Y offset of the crop region (from top edge) |
| width | number | Yes | - | Width of the crop region |
| height | number | Yes | - | Height of the crop region |
| unit | string | No | `"px"` | Unit for the values: `px` or `percent` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Crop using percentage values:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notes

- The crop region must fit within the image boundaries. If the region extends beyond the image, the request will fail.
- When using `percent` unit, values represent percentages of the image dimensions (e.g. `left: 10` means 10% from the left edge).
- Output format matches the input format.
- EXIF orientation is auto-applied before cropping, so coordinates correspond to the visually correct orientation.
