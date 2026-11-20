---
description: Crop all pages of a PDF by margins or to a region.
---

# Crop PDF {#crop-pdf}

Crop all pages of a PDF with one margin on every edge, a separate margin per edge, or down to a region such as a shipping label printed on one corner of the sheet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides`, or `region` |
| margin | number | No | `20` | `uniform` mode: crop margin for every edge in points (0-2000) |
| top, right, bottom, left | number | No | `0` | `sides` mode: crop margin for each edge in points (0-2000) |
| x, y | number | No | `0` | `region` mode: offset of the region from the page's left and top edges in points |
| width, height | number | No | `288`, `432` | `region` mode: size of the region in points (a 4x6 in label) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Keep only the 4x6 in label in the top-left corner of each page:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- All values are in PDF points (1 point = 1/72 inch). A US Letter page is 612 x 792 points.
- Each mode reads only its own fields, so a request that sends only `margin` keeps working.
- A region is measured from each page's top-left corner and must fit inside every page. Margins must leave some of every page. Otherwise the request fails with `400`.
- On a page that's set to display rotated, positions and edges refer to the page before rotation.
- Every mode measures from the full media box, so cropping a page that's already cropped starts over from the full page. A uniform margin of `0` shows the whole media box.
