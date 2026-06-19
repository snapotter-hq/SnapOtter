---
description: Remove password protection from a PDF.
---

# Unlock PDF

Remove password protection from an encrypted PDF by providing the correct password.

## API Endpoint

`POST /api/v1/tools/unlock-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | Password to decrypt the PDF (1-256 characters) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes

- The correct password must be provided; an incorrect password returns a 400 error.
- Either the user password or the owner password will work for decryption.
- Passwords are redacted from audit logs.
