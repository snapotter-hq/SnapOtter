---
description: Permanently remove text occurrences from a PDF (verified true redaction).
---

# Redact PDF {#redact-pdf}

Permanently remove specified text occurrences from a PDF using verified true redaction. The redacted text is completely removed from the file, not just covered with a black box.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | Text strings to redact (1-50 terms, each up to 200 characters) |
| caseSensitive | boolean | No | `false` | Whether matching is case-sensitive |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Accepted input format: `.pdf`.
- This is a fast (synchronous) tool that returns the result directly.
- This performs true redaction: matched text is removed from the PDF content stream, not merely obscured visually.
- The `found` field in the response indicates how many occurrences were redacted.
- You can redact up to 50 terms in a single request.
