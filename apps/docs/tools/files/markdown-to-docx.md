---
description: Convert a Markdown file to a Word document (DOCX).
---

# Markdown to Word {#markdown-to-word}

Convert a Markdown file to a Word document (DOCX), preserving headings, lists, code blocks, and other formatting.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Accepts multipart form data with a Markdown file.

## Parameters {#parameters}

This tool has no configurable parameters. Upload a Markdown file and it will be converted to DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Accepted input formats: `.md`, `.markdown`.
- This is a fast (synchronous) tool that returns the result directly.
- Headings, bold, italic, links, code blocks, and lists are mapped to Word styles.
- Conversion is handled by Pandoc on the server.
