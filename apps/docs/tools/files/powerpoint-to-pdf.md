---
description: Convert presentations to PDF.
---

# PowerPoint to PDF {#powerpoint-to-pdf}

Convert PowerPoint or OpenDocument presentations to PDF, with one slide per page.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Accepts multipart form data with a PowerPoint/ODP file.

## Parameters {#parameters}

This tool has no configurable parameters. Upload a presentation and it will be converted to PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response {#example-response}

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Accepted input formats: `.pptx`, `.ppt`, `.odp`.
- Each slide becomes one page in the PDF.
- Conversion is handled by LibreOffice running headless on the server.
- Animations and transitions are not included in the PDF output.
