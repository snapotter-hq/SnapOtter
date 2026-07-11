---
description: "Ausgewählte Seiten aus einer PDF in ein neues Dokument übernehmen."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 61ad05b44b44
---

# Seiten extrahieren {#extract-pages}

Übernehmen Sie ausgewählte Seiten aus einer PDF in ein neues, kleineres Dokument.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| range | string | Ja | - | Seitenbereich in qpdf-Syntax, z. B. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Seitenbereiche verwenden die qpdf-Syntax: `1-5` für die Seiten 1 bis 5, `z` für die letzte Seite und Kommas zum Kombinieren von Bereichen (z. B. `1-3,7,10-z`).
- Die extrahierten Seiten behalten ihre ursprüngliche Formatierung, Anmerkungen und Links.
