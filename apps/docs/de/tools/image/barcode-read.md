---
description: "Bilder nach QR-Codes, Barcodes und 2D-Codes durchsuchen und eine annotierte Ausgabe erhalten."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 58f0952b6950
---

# Barcode-Leser {#barcode-reader}

Durchsucht hochgeladene Bilder nach allen Arten von Barcodes und QR-Codes. Gibt für jeden erkannten Code den decodierten Text, den Barcode-Typ und Positionsdaten zurück. Erzeugt außerdem ein annotiertes Bild mit farbigen Begrenzungsrahmen um die erkannten Codes.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem optionalen JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Nein | `true` | Aggressiven Scanmodus für schwerer lesbare Barcodes aktivieren (langsamer, aber gründlicher) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Beispielantwort {#example-response}

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

## Antwortfelder {#response-fields}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| filename | string | Ursprünglicher Dateiname |
| barcodes | array | Array der erkannten Barcode-Objekte |
| annotatedUrl | string oder null | URL zum Herunterladen des annotierten Bildes (null, wenn keine Barcodes gefunden wurden) |
| previewUrl | string oder null | Wie annotatedUrl (zur Kompatibilität mit der Frontend-Vorschau) |

### Barcode-Objekt {#barcode-object}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| type | string | Barcode-Format (QRCode, EAN-13, Code128, DataMatrix, PDF417 usw.) |
| text | string | Decodierter Inhalt des Barcodes |
| position | object | Begrenzungsrahmen mit den Koordinaten topLeft, topRight, bottomLeft, bottomRight |

## Unterstützte Barcode-Typen {#supported-barcode-types}

1D-Barcodes: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D-Barcodes: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Hinweise {#notes}

- Verwendet die Bibliothek zxing-wasm zur Barcode-Erkennung.
- Das annotierte Bild legt farbige polygonale Begrenzungsrahmen und nummerierte Beschriftungen über jeden erkannten Barcode.
- In einem einzelnen Bild können bis zu 255 Barcodes erkannt werden.
- Werden keine Barcodes gefunden, ist `barcodes` ein leeres Array und `annotatedUrl` ist null.
- Der Modus `tryHarder` führt ein gründlicheres Scannen auf Kosten der Verarbeitungszeit durch. Deaktivieren Sie ihn für eine schnellere Verarbeitung sauberer, gut ausgerichteter Barcodes.
- Die annotierte Ausgabe ist stets im PNG-Format.
- Eingaben in HEIC, RAW, PSD und SVG werden vor dem Scannen automatisch dekodiert.
- Die EXIF-Ausrichtung wird vor der Verarbeitung automatisch angewendet.
