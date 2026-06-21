---
description: Scan images for QR codes, barcodes, and 2D codes with annotated output.
---

# Barcode Reader

Scan uploaded images for all types of barcodes and QR codes. Returns decoded text, barcode type, and position data for each detected code. Also generates an annotated image with colored bounding boxes around detected codes.

## API Endpoint

`POST /api/v1/tools/image/barcode-read`

Accepts multipart form data with an image file and an optional JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | Enable aggressive scanning mode for harder-to-read barcodes (slower but more thorough) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Original filename |
| barcodes | array | Array of detected barcode objects |
| annotatedUrl | string or null | URL to download the annotated image (null if no barcodes found) |
| previewUrl | string or null | Same as annotatedUrl (for frontend preview compatibility) |

### Barcode Object

| Field | Type | Description |
|-------|------|-------------|
| type | string | Barcode format (QRCode, EAN-13, Code128, DataMatrix, PDF417, etc.) |
| text | string | Decoded content of the barcode |
| position | object | Bounding box with topLeft, topRight, bottomLeft, bottomRight coordinates |

## Supported Barcode Types

1D barcodes: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D barcodes: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Notes

- Uses the zxing-wasm library for barcode detection.
- The annotated image overlays colored polygon bounding boxes and numbered labels on each detected barcode.
- Up to 255 barcodes can be detected in a single image.
- If no barcodes are found, `barcodes` is an empty array and `annotatedUrl` is null.
- The `tryHarder` mode performs more thorough scanning at the cost of processing time. Disable it for faster processing of clean, well-aligned barcodes.
- The annotated output is always PNG format.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before scanning.
- EXIF orientation is auto-applied before processing.
