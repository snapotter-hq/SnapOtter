---
description: Convert between PowerPoint and OpenDocument presentation formats.
---

# Convert Presentation {#convert-presentation}

Convert presentations between PowerPoint (PPTX) and OpenDocument Presentation (ODP) formats.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Accepts multipart form data with a PowerPoint/ODP file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Output format: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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
- Conversion is handled by LibreOffice running headless on the server.
- Animations and transition effects may not be preserved across formats.
- The output format must differ from the input format.
