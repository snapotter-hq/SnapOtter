---
description: "PDF-Dokumentmetadaten lesen und schreiben."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: f41408411285
---

# PDF-Metadaten {#pdf-metadata}

Lesen und aktualisieren Sie PDF-Dokumentmetadatenfelder wie Titel, Autor, Betreff und Schlüsselwörter. Wenn keine Einstellungen angegeben werden, werden die vorhandenen Metadaten unverändert zurückgegeben.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem optionalen JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| title | string | Nein | - | Dokumenttitel (max. 500 Zeichen) |
| author | string | Nein | - | Dokumentautor (max. 500 Zeichen) |
| subject | string | Nein | - | Dokumentbetreff (max. 500 Zeichen) |
| keywords | string | Nein | - | Dokumentschlüsselwörter (max. 500 Zeichen) |

Alle Parameter sind optional. Weggelassene Felder bleiben unverändert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Das Feld `metadata` in der Antwort enthält die resultierenden Metadaten nach etwaigen Aktualisierungen.
- Um Metadaten zu lesen, ohne sie zu ändern, lassen Sie das Feld `settings` weg oder senden Sie ein leeres Objekt.
- Jedes Metadatenfeld ist auf 500 Zeichen begrenzt.
