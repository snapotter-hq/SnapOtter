---
description: "Genereer barcodes in de formaten Code 128, EAN-13, UPC-A, Code 39, ITF-14 en Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: b87b19b9d405
---

# Barcode-generator {#barcode-generator}

Genereer barcode-afbeeldingen op basis van tekstinvoer. Ondersteunt de formaten Code 128, EAN-13, UPC-A, Code 39, ITF-14 en Data Matrix.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Accepteert een `application/json`-body (geen multipart). De barcode wordt gegenereerd op basis van de opgegeven tekst, niet op basis van een geüpload bestand.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Tekst die in de barcode wordt gecodeerd (1-256 tekens) |
| type | string | Nee | `"code128"` | Barcodeformaat: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Nee | `3` | Schaalfactor van de afbeelding (1-8) |
| includeText | boolean | Nee | `true` | Of de tekst onder de barcode wordt weergegeven |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Opmerkingen {#notes}

- In tegenstelling tot de meeste tools accepteert dit endpoint een JSON-body en geen multipart form data, aangezien barcodes worden gegenereerd op basis van tekst in plaats van een geüpload bestand.
- EAN-13 vereist precies 12 of 13 cijfers. UPC-A vereist precies 11 of 12 cijfers. Als een controlecijfer wordt weggelaten, wordt het automatisch berekend.
- Code 128 is het meest flexibele formaat en ondersteunt de volledige ASCII-tekenset.
- Data Matrix produceert een 2D-barcode die geschikt is om langere tekenreeksen in een compact vierkant te coderen.
