---
description: Delete specific pages from a PDF.
---

# Remove Pages

Delete specific pages from a PDF, keeping all remaining pages intact.

## API Endpoint

`POST /api/v1/tools/pdf/remove-pages`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | Page range to remove in qpdf syntax, e.g. `"3,5-7"` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes

- You cannot remove every page from a document; at least one page must remain.
- Page ranges use qpdf syntax: `3` for a single page, `5-7` for a range, and commas to combine (e.g. `1,3,5-7`).
