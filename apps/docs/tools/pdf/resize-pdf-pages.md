---
description: Resize every page of a PDF to A4, Letter, a 4x6 in shipping label, or a custom size.
---

# Resize PDF Pages {#resize-pdf-pages}

Change the page size of every page in a PDF. The content is scaled to fit the new page and centered, so text, vector art, and barcodes stay sharp. Use it to turn a shipping label into a 4x6 in page for a thermal printer, or to move a document between A4 and US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | Target size: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal`, or `custom` |
| width | number | No | `4` | Custom page width, used when `pageSize` is `custom` |
| height | number | No | `6` | Custom page height, used when `pageSize` is `custom` |
| unit | string | No | `"in"` | Unit for the custom size: `in` or `mm` |
| keepOrientation | boolean | No | `false` | Turn the target size to match each page's orientation instead of forcing width by height |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Pages are scaled to fit, never stretched. When the aspect ratio differs, the leftover space is left blank.
- Resizing doesn't crop. A label printed on a quarter of a Letter or A4 page still fills only a quarter of the new page.
- Custom sizes must be 0.5-200 in (12.7-5080 mm) on each side.
- The page is resized from its crop box when it has one, so a cropped page keeps only the cropped region.
