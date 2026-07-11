---
description: Read and write PDF document metadata.
---

# PDF Metadata {#pdf-metadata}

Read and update PDF document metadata fields such as title, author, subject, and keywords. When no settings are provided, the existing metadata is returned without modification.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Accepts multipart form data with a PDF file and an optional JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Document title (max 500 characters) |
| author | string | No | - | Document author (max 500 characters) |
| subject | string | No | - | Document subject (max 500 characters) |
| keywords | string | No | - | Document keywords (max 500 characters) |

All parameters are optional. Omitted fields are left unchanged.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Accepted input format: `.pdf`.
- This is a fast (synchronous) tool that returns the result directly.
- The `metadata` field in the response contains the resulting metadata after any updates.
- To read metadata without modifying it, omit the `settings` field or send an empty object.
- Each metadata field is limited to 500 characters.
