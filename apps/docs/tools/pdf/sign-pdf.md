---
description: Stamp uploaded signature images onto a PDF using normalized page placements.
---

# Sign PDF {#sign-pdf}

Stamp one or more uploaded signature PNG images onto any page of a PDF. This route uses a custom multipart contract because it needs the PDF, one or more signature images, and placement coordinates.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Accepts multipart form data. The PDF is sent as `file`; signatures are sent as `sig0`, `sig1`, and so on; placements are sent in a `placements` JSON field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | PDF file to sign |
| sig0 | file | Yes | - | First signature image. Additional images use `sig1`, `sig2`, and so on |
| placements | JSON string | Yes | - | Array of placement objects: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | Optional UUID for progress tracking via SSE |
| fileId | string | No | - | Optional file library ID to save the signed result as a new version |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | Signature image index. `0` maps to `sig0` |
| page | integer | Zero-based PDF page index |
| x | number | Left position as a page fraction |
| y | number | Top position as a page fraction |
| w | number | Signature width as a page fraction |
| h | number | Signature height as a page fraction |

Coordinates use a top-left origin. Values may bleed slightly beyond the page edge; the PDF renderer clips the final stamp to the page.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

If the request cannot finish inside the synchronous wait window, the API returns:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Connect to `/api/v1/jobs/<jobId>/progress` and download the result when the job completes.

## Notes {#notes}

- Accepted PDF input format: `.pdf`.
- Signature images must be valid image files, typically PNG with transparency.
- Up to 100 signature images and 100 placements are accepted.
- `sign-pdf` is a custom route and does not use the standard tool `settings` JSON field.
