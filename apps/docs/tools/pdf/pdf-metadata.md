---
description: Read and write PDF document metadata.
---

# PDF Metadata {#pdf-metadata}

Read and update PDF document metadata fields such as title, author, subject, and keywords, or remove the document's metadata altogether. When no settings are provided, the existing metadata is returned without modification.

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
| stripAll | boolean | No | false | Remove the whole Info dictionary (dates, Creator, Producer, custom keys), every XMP stream (document, pages, images) and all PieceInfo application data, then write any fields given above |
| removeAttachments | boolean | No | false | Also remove embedded files: the document's attachment list, file attachment annotations and associated files (`/AF`). Needs `stripAll` |

All parameters are optional. Omitted fields are left unchanged unless `stripAll` is set.

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
- With `stripAll`, the response also carries `stripped`: the Info keys that were removed (`removed`), whether the document XMP stream was removed (`xmpRemoved`), the PDF/A level the input declared (`pdfa`, or `null`), how many XMP streams came off pages, images and other objects (`objectXmpRemoved`), how many PieceInfo dictionaries were removed (`pieceInfoRemoved`), and how many embedded files were removed (`attachmentsRemoved`, always `0` without `removeAttachments`). Removing XMP breaks PDF/A conformance.
- `stripAll` on its own keeps embedded file attachments, since removing them changes the document's content. Add `removeAttachments` to drop them too. That removes the attached XML from ZUGFeRD and Factur-X e-invoices and breaks PDF/A-3 conformance.
- Sending `removeAttachments` without `stripAll` returns 400.
