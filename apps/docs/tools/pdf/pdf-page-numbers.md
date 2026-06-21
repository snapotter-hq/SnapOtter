---
description: Add page numbers to every page of a PDF.
---

# PDF Page Numbers

Add "Page N of M" page numbers to every page of a PDF.

## API Endpoint

`POST /api/v1/tools/pdf/pdf-page-numbers`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | Page number placement: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | Font size in points (6-24) |

### Position Values

- `tl` top-left, `tc` top-center, `tr` top-right
- `bl` bottom-left, `bc` bottom-center, `br` bottom-right

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes

- Page numbers are rendered in the format "Page 1 of 10".
- Numbers are added to every page, including any existing title or cover pages.
- The default position `"bc"` places numbers at the bottom center of each page.
