---
description: "Converteer een Markdown-bestand naar een op zichzelf staande HTML-pagina."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 5026512ebf7b
---

# Markdown to HTML {#markdown-to-html}

Converteer een Markdown-bestand naar een op zichzelf staande HTML-pagina. Externe afbeeldingen waarnaar in de bron wordt verwezen, blijven ongewijzigd in de uitvoer.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Accepteert multipart-formulierdata met een Markdown-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een Markdown-bestand en het wordt naar HTML geconverteerd.

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

- Geaccepteerde invoerformaten: `.md`, `.markdown`.
- Dit is een snelle (synchrone) tool die het resultaat rechtstreeks retourneert.
- De uitvoer is een op zichzelf staande HTML-pagina met inline stijlen.
- Externe afbeeldings-URL's in de Markdown-bron blijven ongewijzigd en worden niet opgehaald.
