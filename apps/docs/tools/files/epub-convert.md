---
description: Convert an EPUB to PDF, DOCX, HTML, or Markdown.
---

# Convert from EPUB {#convert-epub}

Convert an EPUB e-book to PDF, Word (DOCX), HTML, or Markdown. Remote resources inside the book are not fetched.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Accepts multipart form data with an EPUB file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Output format: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Accepted input format: `.epub`.
- Remote resources embedded in the EPUB (external images, fonts) are not fetched for security.
- Image fidelity in the converted output may vary depending on the EPUB structure.
- Conversion is handled by Pandoc on the server.
