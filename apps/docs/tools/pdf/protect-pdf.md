---
description: Add password protection with AES-256 encryption to a PDF.
---

# Protect PDF {#protect-pdf}

Add password protection to a PDF using AES-256 encryption.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | Password required to open the PDF (1-256 characters) |
| ownerPassword | string | No | Same as `userPassword` | Owner password for permissions (1-256 characters) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Encryption uses AES-256.
- If `ownerPassword` is omitted, it defaults to the same value as `userPassword`.
- Passwords are redacted from audit logs.
- The encrypted PDF requires the user password to open and the owner password (if different) for full permissions.
