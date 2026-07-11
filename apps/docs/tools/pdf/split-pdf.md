---
description: Extract pages or split a PDF into parts.
---

# Split PDF {#split-pdf}

Extract a range of pages into a new PDF, or split a document into chunks of N pages.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | Split mode: `range` or `every` |
| range | string | When mode is `range` | - | Page range in qpdf syntax, e.g. `"1-5,8,10-z"` |
| everyN | integer | When mode is `every` | - | Split into chunks of N pages (1-500) |

## Example Request {#example-request}

Extract specific pages:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Split into chunks of 10 pages:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- In `range` mode, a single PDF containing the selected pages is returned.
- In `every` mode, the result is a ZIP archive containing the individual parts.
- Page ranges use qpdf syntax: `1-5` for pages 1 through 5, `z` for the last page, and commas to combine ranges (e.g. `1-3,7,10-z`).
