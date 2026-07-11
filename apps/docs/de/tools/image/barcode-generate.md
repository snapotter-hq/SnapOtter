---
description: "Barcodes in den Formaten Code 128, EAN-13, UPC-A, Code 39, ITF-14 und Data Matrix erzeugen."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 175106f249fc
---

# Barcode-Generator {#barcode-generator}

Erzeugt Barcode-Bilder aus einer Texteingabe. Unterstützt die Formate Code 128, EAN-13, UPC-A, Code 39, ITF-14 und Data Matrix.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Nimmt einen `application/json`-Body (nicht multipart) entgegen. Der Barcode wird aus dem angegebenen Text erzeugt, nicht aus einer hochgeladenen Datei.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Im Barcode zu codierender Text (1-256 Zeichen) |
| type | string | Nein | `"code128"` | Barcode-Format: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Nein | `3` | Skalierungsfaktor des Bildes (1-8) |
| includeText | boolean | Nein | `true` | Ob der Text unter dem Barcode dargestellt wird |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Hinweise {#notes}

- Anders als die meisten Werkzeuge nimmt dieser Endpunkt einen JSON-Body und keine Multipart-Formulardaten entgegen, da Barcodes aus Text statt aus einer hochgeladenen Datei erzeugt werden.
- EAN-13 erfordert genau 12 oder 13 Ziffern. UPC-A erfordert genau 11 oder 12 Ziffern. Wird eine Prüfziffer weggelassen, wird sie automatisch berechnet.
- Code 128 ist das flexibelste Format und unterstützt den gesamten ASCII-Zeichensatz.
- Data Matrix erzeugt einen 2D-Barcode, der sich zum Codieren längerer Zeichenketten in einem kompakten Quadrat eignet.
