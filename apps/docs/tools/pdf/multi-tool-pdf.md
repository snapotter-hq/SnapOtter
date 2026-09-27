---
description: Reorder, rotate, delete, and pull in pages from other PDFs in one editor or via the API.
---

# PDF Multi-Tool {#multi-tool-pdf}

Assemble a PDF from an explicit page plan: reorder, duplicate, rotate, or delete pages, and pull pages from additional PDFs — all in one request.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Accepts multipart form data with one or more PDF files and a JSON `settings` field.
Up to 20 input documents and 1,200 output pages are supported per request.

## Parameters {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | Output page plan, in output order. Each item is `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexes the uploaded files in upload order (0-based); `page` is a 1-based page number in that document. |
| pageCounts | array | Yes | Real page count of each uploaded document, in the same order. A plan page beyond its document's count is rejected with 400. |

## Example Request {#example-request}

Take pages 3 and 1 of the first document, then pages 1 and 2 of the second, rotating the first output page by 90° clockwise:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- The same page can appear several times in `items` to duplicate it.
- Pages absent from `items` are omitted from the output.
- `rot` records the new display orientation on the copied page (composed with any existing rotation); the page content is untouched.
- Rotation is applied per output copy, so duplicates can have different rotations.
- The output is a new, flat document; source bookmarks and document-level metadata are not retained.
- Processing requires the qpdf binary, which ships in the official Docker image.
