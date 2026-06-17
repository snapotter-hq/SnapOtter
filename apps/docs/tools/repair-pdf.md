---
description: Attempt to repair a damaged or corrupted PDF.
---

# Repair PDF

Attempt to repair a damaged or corrupted PDF by reconstructing its internal structure.

## API Endpoint

`POST /api/v1/tools/repair-pdf`

Accepts multipart form data with a PDF file. No `settings` field is required.

## Parameters

This tool has no settings parameters. Upload the damaged PDF file directly.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes

- Structural validation is skipped on input to allow malformed files through.
- Repair is best-effort; severely corrupted files may not be fully recoverable.
- The repaired PDF may differ slightly in size from the original due to reconstructed cross-reference tables.
