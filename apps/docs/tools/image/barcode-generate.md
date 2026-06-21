---
description: Generate barcodes in Code 128, EAN-13, UPC-A, Code 39, ITF-14, and Data Matrix formats.
---

# Barcode Generator

Generate barcode images from text input. Supports Code 128, EAN-13, UPC-A, Code 39, ITF-14, and Data Matrix formats.

## API Endpoint

`POST /api/v1/tools/image/barcode-generate`

Accepts an `application/json` body (not multipart). The barcode is generated from the provided text, not from an uploaded file.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Text to encode in the barcode (1-256 characters) |
| type | string | No | `"code128"` | Barcode format: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | No | `3` | Image scale factor (1-8) |
| includeText | boolean | No | `true` | Whether to render the text below the barcode |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes

- Unlike most tools, this endpoint accepts a JSON body, not multipart form data, since barcodes are generated from text rather than an uploaded file.
- EAN-13 requires exactly 12 or 13 digits. UPC-A requires exactly 11 or 12 digits. If a check digit is omitted, it is calculated automatically.
- Code 128 is the most flexible format and supports the full ASCII character set.
- Data Matrix produces a 2D barcode suitable for encoding longer strings in a compact square.
