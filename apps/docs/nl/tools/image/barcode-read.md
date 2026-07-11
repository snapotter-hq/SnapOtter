---
description: "Scan afbeeldingen op QR-codes, barcodes en 2D-codes met geannoteerde uitvoer."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 754dc6eb110b
---

# Barcodelezer {#barcode-reader}

Scan geüploade afbeeldingen op alle soorten barcodes en QR-codes. Retourneert de gedecodeerde tekst, het barcodetype en positiegegevens voor elke gedetecteerde code. Genereert ook een geannoteerde afbeelding met gekleurde omkaderingen rond de gedetecteerde codes.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Accepteert multipart form data met een afbeeldingsbestand en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Nee | `true` | Schakel de agressieve scanmodus in voor lastiger te lezen barcodes (langzamer maar grondiger) |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Voorbeeldantwoord {#example-response}

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

## Antwoordvelden {#response-fields}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| filename | string | Originele bestandsnaam |
| barcodes | array | Array van gedetecteerde barcode-objecten |
| annotatedUrl | string of null | URL om de geannoteerde afbeelding te downloaden (null als er geen barcodes zijn gevonden) |
| previewUrl | string of null | Hetzelfde als annotatedUrl (voor compatibiliteit met de frontend-voorbeeldweergave) |

### Barcode-object {#barcode-object}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| type | string | Barcodeformaat (QRCode, EAN-13, Code128, DataMatrix, PDF417, enz.) |
| text | string | Gedecodeerde inhoud van de barcode |
| position | object | Omkadering met de coördinaten topLeft, topRight, bottomLeft, bottomRight |

## Ondersteunde barcodetypen {#supported-barcode-types}

1D-barcodes: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D-barcodes: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Opmerkingen {#notes}

- Gebruikt de bibliotheek zxing-wasm voor barcodedetectie.
- De geannoteerde afbeelding legt gekleurde veelhoekige omkaderingen en genummerde labels over elke gedetecteerde barcode.
- Er kunnen maximaal 255 barcodes in één afbeelding worden gedetecteerd.
- Als er geen barcodes worden gevonden, is `barcodes` een lege array en is `annotatedUrl` null.
- De modus `tryHarder` voert een grondigere scan uit ten koste van de verwerkingstijd. Schakel deze uit voor snellere verwerking van schone, goed uitgelijnde barcodes.
- De geannoteerde uitvoer heeft altijd het PNG-formaat.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór het scannen.
- De EXIF-oriëntatie wordt automatisch toegepast vóór de verwerking.
