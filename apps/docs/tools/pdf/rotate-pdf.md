---
description: Rotate pages in a PDF by 90, 180, or 270 degrees.
---

# Rotate PDF {#rotate-pdf}

Rotate all or selected pages in a PDF by a specified angle.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | Rotation angle: `90`, `180`, or `270` |
| range | string | No | `"1-z"` | Page range in qpdf syntax, e.g. `"1-5,8"` (`"1-z"` = all pages) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Rotation is clockwise.
- Page ranges use qpdf syntax: `1-5` for pages 1 through 5, `z` for the last page, and commas to combine ranges.
- The default range `"1-z"` rotates all pages.
