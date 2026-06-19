---
description: Bake forms and annotations into page content.
---

# Flatten PDF

Bake interactive form fields and annotations into the page content, producing a static PDF that looks the same everywhere.

## API Endpoint

`POST /api/v1/tools/flatten-pdf`

Accepts multipart form data with a PDF file.

## Parameters

This tool has no configurable parameters. Upload a PDF and all forms and annotations will be flattened.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes

- Accepted input format: `.pdf`.
- This is a fast (synchronous) tool that returns the result directly.
- Form field values are preserved as static text in the output.
- Annotations (comments, highlights, sticky notes) become part of the page content and can no longer be edited.
