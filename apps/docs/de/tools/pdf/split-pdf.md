---
description: "Seiten extrahieren oder eine PDF in Teile aufteilen."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: dd583d11a330
---

# PDF aufteilen {#split-pdf}

Extrahieren Sie einen Seitenbereich in eine neue PDF oder teilen Sie ein Dokument in Blöcke von N Seiten auf.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `"range"` | Aufteilungsmodus: `range` oder `every` |
| range | string | Wenn mode `range` ist | - | Seitenbereich in qpdf-Syntax, z. B. `"1-5,8,10-z"` |
| everyN | integer | Wenn mode `every` ist | - | In Blöcke von N Seiten aufteilen (1-500) |

## Example Request {#example-request}

Bestimmte Seiten extrahieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

In Blöcke von 10 Seiten aufteilen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- Im Modus `range` wird eine einzelne PDF zurückgegeben, die die ausgewählten Seiten enthält.
- Im Modus `every` ist das Ergebnis ein ZIP-Archiv, das die einzelnen Teile enthält.
- Seitenbereiche verwenden die qpdf-Syntax: `1-5` für die Seiten 1 bis 5, `z` für die letzte Seite und Kommas zum Kombinieren von Bereichen (z. B. `1-3,7,10-z`).
