---
description: Reorder pages in a PDF with an explicit page order.
---

# Organize PDF

Reorder pages in a PDF by specifying the desired page sequence.

## API Endpoint

`POST /api/v1/tools/pdf/organize-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | Desired page order in qpdf syntax, e.g. `"3,1,2,5-z"` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes

- Page ranges use qpdf syntax: `3,1,2` reorders the first three pages, and `5-z` appends pages 5 through the last page.
- Pages can be duplicated by listing them more than once (e.g. `"1,1,2,3"` duplicates page 1).
- Pages not listed in the order string are omitted from the output.
