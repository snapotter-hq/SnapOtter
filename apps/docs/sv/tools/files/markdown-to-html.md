---
description: "Konvertera en Markdown-fil till en fristående HTML-sida."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 49899e726065
---

# Markdown to HTML {#markdown-to-html}

Konvertera en Markdown-fil till en fristående HTML-sida. Fjärrbilder som refereras i källan lämnas som de är i utdatan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Tar emot multipart-formulärdata med en Markdown-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en Markdown-fil så konverteras den till HTML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Godkända indataformat: `.md`, `.markdown`.
- Detta är ett snabbt (synkront) verktyg som returnerar resultatet direkt.
- Utdatan är en fristående HTML-sida med infogade stilar.
- Fjärrbild-URL:er i Markdown-källan bevaras som de är och hämtas inte.
