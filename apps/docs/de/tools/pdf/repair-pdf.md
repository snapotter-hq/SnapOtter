---
description: "Versuchen, eine beschädigte oder defekte PDF zu reparieren."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: c96a53dff4c2
---

# PDF reparieren {#repair-pdf}

Versuchen Sie, eine beschädigte oder defekte PDF zu reparieren, indem ihre interne Struktur rekonstruiert wird.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei. Es ist kein Feld `settings` erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie die beschädigte PDF-Datei direkt hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Die strukturelle Validierung der Eingabe wird übersprungen, um fehlerhafte Dateien zuzulassen.
- Die Reparatur erfolgt nach bestem Bemühen; stark beschädigte Dateien lassen sich möglicherweise nicht vollständig wiederherstellen.
- Die reparierte PDF kann sich aufgrund der rekonstruierten Querverweistabellen geringfügig in der Größe vom Original unterscheiden.
