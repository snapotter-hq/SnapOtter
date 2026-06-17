---
description: Safely extract files from a ZIP archive with bomb protection.
---

# Extract ZIP

Safely extract files from a ZIP archive. Single-file archives return the contained file directly; multi-file archives return a flat ZIP with the extracted contents.

## API Endpoint

`POST /api/v1/tools/extract-zip`

Accepts multipart form data with a ZIP file. No settings field is required.

## Parameters

This tool has no configurable parameters. Upload a `.zip` file to extract.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes

- Only `.zip` files are accepted as input.
- If the archive contains a single file, that file is returned directly (not wrapped in a ZIP).
- If the archive contains multiple files, a flat ZIP is returned with all files extracted to the root level (nested directory structure is flattened).
- Built-in bomb protection rejects archives with excessive compression ratios or file counts to prevent resource exhaustion.
