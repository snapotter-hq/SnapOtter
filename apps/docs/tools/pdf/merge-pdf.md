---
description: Combine multiple PDFs into a single document.
---

# Merge PDFs {#merge-pdfs}

Combine two or more PDF files into a single document, preserving the page order of each input file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Accepts multipart form data with two or more PDF files. No `settings` field is required.

## Parameters {#parameters}

This tool has no settings parameters. Simply upload two or more PDF files.

| Constraint | Value |
|------------|-------|
| Minimum files | 2 |
| Maximum files | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Files are merged in the order they are uploaded.
- At least two PDF files are required; the request will fail with a 400 error if fewer are provided.
- The maximum number of input files is 20.
- Encrypted PDFs must be unlocked before merging.
