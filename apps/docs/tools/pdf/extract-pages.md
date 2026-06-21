---
description: Pull selected pages from a PDF into a new document.
---

# Extract Pages

Pull selected pages from a PDF into a new, smaller document.

## API Endpoint

`POST /api/v1/tools/pdf/extract-pages`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | Page range in qpdf syntax, e.g. `"1-5,8,10-z"` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes

- Page ranges use qpdf syntax: `1-5` for pages 1 through 5, `z` for the last page, and commas to combine ranges (e.g. `1-3,7,10-z`).
- The extracted pages retain their original formatting, annotations, and links.
