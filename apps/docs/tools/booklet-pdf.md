---
description: Arrange PDF pages for folding into a booklet.
---

# Booklet PDF

Impose pages for duplex printing so the printed sheets can be folded into a booklet.

## API Endpoint

`POST /api/v1/tools/booklet-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Pages per sheet: `2`, `4`, `6`, or `8` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes

- The default `perSheet: 2` places two pages side by side on each sheet, which is the standard booklet layout for duplex printing.
- Blank pages are added automatically if the total page count is not a multiple of the sheet size.
- Print the output double-sided on short-edge binding, then fold and staple.
