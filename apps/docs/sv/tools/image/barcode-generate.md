---
description: "Generera streckkoder i formaten Code 128, EAN-13, UPC-A, Code 39, ITF-14 och Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: abf2dc5c8075
---

# Streckkodsgenerator {#barcode-generator}

Generera streckkodsbilder från textinmatning. Stöder formaten Code 128, EAN-13, UPC-A, Code 39, ITF-14 och Data Matrix.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Tar emot en `application/json`-kropp (inte multipart). Streckkoden genereras från den angivna texten, inte från en uppladdad fil.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| text | sträng | Ja | - | Text att koda i streckkoden (1-256 tecken) |
| type | sträng | Nej | `"code128"` | Streckkodsformat: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | heltal | Nej | `3` | Skalfaktor för bilden (1-8) |
| includeText | boolean | Nej | `true` | Om texten ska renderas under streckkoden |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Anteckningar {#notes}

- Till skillnad från de flesta verktyg tar den här slutpunkten emot en JSON-kropp, inte multipart-formulärdata, eftersom streckkoder genereras från text snarare än från en uppladdad fil.
- EAN-13 kräver exakt 12 eller 13 siffror. UPC-A kräver exakt 11 eller 12 siffror. Om en kontrollsiffra utelämnas beräknas den automatiskt.
- Code 128 är det mest flexibla formatet och stöder hela ASCII-teckenuppsättningen.
- Data Matrix ger en 2D-streckkod som lämpar sig för att koda längre strängar i en kompakt kvadrat.
