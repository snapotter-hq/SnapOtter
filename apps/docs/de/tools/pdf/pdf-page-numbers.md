---
description: "Seitenzahlen zu jeder Seite einer PDF hinzufügen."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 193814878a02
---

# PDF-Seitenzahlen {#pdf-page-numbers}

Fügen Sie Seitenzahlen im Format "Seite N von M" zu jeder Seite einer PDF hinzu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| position | string | Nein | `"bc"` | Platzierung der Seitenzahl: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Nein | `10` | Schriftgröße in Punkten (6-24) |

### Position Values {#position-values}

- `tl` oben links, `tc` oben Mitte, `tr` oben rechts
- `bl` unten links, `bc` unten Mitte, `br` unten rechts

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Seitenzahlen werden im Format "Seite 1 von 10" gerendert.
- Die Nummern werden zu jeder Seite hinzugefügt, einschließlich vorhandener Titel- oder Deckblätter.
- Die Standardposition `"bc"` platziert die Nummern unten in der Mitte jeder Seite.
