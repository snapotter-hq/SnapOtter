---
description: "Seiten in einer PDF mit einer expliziten Seitenreihenfolge neu anordnen."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 3438cd18a83f
---

# PDF organisieren {#organize-pdf}

Ordnen Sie Seiten in einer PDF neu an, indem Sie die gewünschte Seitenreihenfolge angeben.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| order | string | Ja | - | Gewünschte Seitenreihenfolge in qpdf-Syntax, z. B. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Seitenbereiche verwenden die qpdf-Syntax: `3,1,2` ordnet die ersten drei Seiten neu an, und `5-z` hängt die Seiten 5 bis zur letzten Seite an.
- Seiten können dupliziert werden, indem sie mehr als einmal aufgeführt werden (z. B. dupliziert `"1,1,2,3"` Seite 1).
- Seiten, die nicht in der Reihenfolgezeichenfolge aufgeführt sind, werden in der Ausgabe weggelassen.
