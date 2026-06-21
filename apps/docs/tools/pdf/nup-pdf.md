---
description: Arrange multiple PDF pages per sheet (2-up, 4-up, etc.).
---

# N-up PDF

Arrange multiple pages per sheet to save paper when printing, such as 2-up or 4-up layouts.

## API Endpoint

`POST /api/v1/tools/pdf/nup-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Pages per sheet: `2`, `3`, `4`, `8`, `9`, `12`, or `16` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes

- Pages are arranged in reading order (left to right, top to bottom).
- The output page size matches the original; individual pages are scaled down to fit the grid.
- A 20-page document with `perSheet: 4` produces a 5-page output.
