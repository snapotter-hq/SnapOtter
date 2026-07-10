---
description: Convert Word, Markdown, HTML, or plain text files to EPUB.
---

# Convert to EPUB {#convert-to-epub}

Convert Word documents, Markdown, HTML, or plain text files into the EPUB e-book format.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Accepts multipart form data with a Word/Markdown/HTML/TXT file.

## Parameters {#parameters}

This tool has no configurable parameters. Upload a document and it will be converted to EPUB.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Accepted input formats: `.docx`, `.md`, `.html`, `.txt`.
- The EPUB output follows the EPUB 3 specification.
- Headings in the source document are used to generate the table of contents.
- Conversion is handled by Pandoc on the server.
