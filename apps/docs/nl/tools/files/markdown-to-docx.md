---
description: "Converteer een Markdown-bestand naar een Word-document (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: c14d8d7a26ea
---

# Markdown to Word {#markdown-to-word}

Converteer een Markdown-bestand naar een Word-document (DOCX), met behoud van koppen, lijsten, codeblokken en andere opmaak.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Accepteert multipart-formulierdata met een Markdown-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een Markdown-bestand en het wordt naar DOCX geconverteerd.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Geaccepteerde invoerformaten: `.md`, `.markdown`.
- Dit is een snelle (synchrone) tool die het resultaat rechtstreeks retourneert.
- Koppen, vet, cursief, links, codeblokken en lijsten worden toegewezen aan Word-stijlen.
- De conversie wordt uitgevoerd door Pandoc op de server.
