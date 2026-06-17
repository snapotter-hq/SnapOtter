---
description: Bundle multiple files into a single ZIP archive.
---

# Create ZIP

Bundle multiple files of any type into a single ZIP archive. Duplicate filenames are automatically deduplicated.

## API Endpoint

`POST /api/v1/tools/create-zip`

Accepts multipart form data with two or more files. No settings field is required.

## Parameters

This tool has no configurable parameters. Upload 2--50 files of any type to bundle.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes

- Requires between 2 and 50 input files.
- Any file type is accepted; there are no restrictions on input format.
- If multiple files share the same name, they are automatically deduplicated with numeric suffixes.
- The output archive uses standard ZIP compression (deflate).
