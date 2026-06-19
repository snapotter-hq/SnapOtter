---
description: Crop all pages of a PDF with a uniform margin.
---

# Crop PDF

Crop all pages of a PDF by applying a uniform margin, trimming content from each edge equally.

## API Endpoint

`POST /api/v1/tools/crop-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | Uniform crop margin in points (0-2000) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes

- The margin value is in PDF points (1 point = 1/72 inch).
- The same margin is applied to all four edges of every page.
- A margin of `0` removes all existing crop margins, showing the full media box.
