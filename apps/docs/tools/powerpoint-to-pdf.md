---
description: Convert presentations to PDF.
---

# PowerPoint to PDF

Convert PowerPoint or OpenDocument presentations to PDF, with one slide per page.

## API Endpoint

`POST /api/v1/tools/powerpoint-to-pdf`

Accepts multipart form data with a PowerPoint/ODP file.

## Parameters

This tool has no configurable parameters. Upload a presentation and it will be converted to PDF.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Accepted input formats: `.pptx`, `.ppt`, `.odp`.
- Each slide becomes one page in the PDF.
- Conversion is handled by LibreOffice running headless on the server.
- Animations and transitions are not included in the PDF output.
