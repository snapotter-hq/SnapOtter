---
description: "Skanna bilder efter QR-koder, streckkoder och 2D-koder med annoterad utdata."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: b160884624f2
---

# Streckkodsläsare {#barcode-reader}

Skanna uppladdade bilder efter alla typer av streckkoder och QR-koder. Returnerar avkodad text, streckkodstyp och positionsdata för varje upptäckt kod. Genererar även en annoterad bild med färgade begränsningsrutor runt de upptäckta koderna.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Tar emot multipart-formulärdata med en bildfil och ett valfritt JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Nej | `true` | Aktivera aggressivt skanningsläge för svårlästa streckkoder (långsammare men mer grundligt) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Exempelsvar {#example-response}

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

## Svarsfält {#response-fields}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| filename | sträng | Ursprungligt filnamn |
| barcodes | array | Array av upptäckta streckkodsobjekt |
| annotatedUrl | sträng eller null | URL för att ladda ner den annoterade bilden (null om inga streckkoder hittades) |
| previewUrl | sträng eller null | Samma som annotatedUrl (för kompatibilitet med förhandsvisning i gränssnittet) |

### Streckkodsobjekt {#barcode-object}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| type | sträng | Streckkodsformat (QRCode, EAN-13, Code128, DataMatrix, PDF417 osv.) |
| text | sträng | Avkodat innehåll i streckkoden |
| position | objekt | Begränsningsruta med koordinaterna topLeft, topRight, bottomLeft, bottomRight |

## Streckkodstyper som stöds {#supported-barcode-types}

1D-streckkoder: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D-streckkoder: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Anteckningar {#notes}

- Använder biblioteket zxing-wasm för streckkodsdetektering.
- Den annoterade bilden lägger färgade polygonformade begränsningsrutor och numrerade etiketter över varje upptäckt streckkod.
- Upp till 255 streckkoder kan upptäckas i en enda bild.
- Om inga streckkoder hittas är `barcodes` en tom array och `annotatedUrl` är null.
- Läget `tryHarder` utför en mer grundlig skanning på bekostnad av bearbetningstid. Inaktivera det för snabbare bearbetning av rena, väl inriktade streckkoder.
- Den annoterade utdata är alltid i PNG-format.
- HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före skanning.
- EXIF-orientering tillämpas automatiskt före bearbetning.
