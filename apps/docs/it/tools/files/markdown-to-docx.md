---
description: "Converte un file Markdown in un documento Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 5e30fda13b5e
---

# Markdown to Word {#markdown-to-word}

Converte un file Markdown in un documento Word (DOCX), preservando intestazioni, elenchi, blocchi di codice e altra formattazione.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Accetta dati form multipart con un file Markdown.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un file Markdown e verrà convertito in DOCX.

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

- Formati di input accettati: `.md`, `.markdown`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- Intestazioni, grassetto, corsivo, link, blocchi di codice ed elenchi vengono mappati agli stili di Word.
- La conversione è gestita da Pandoc sul server.
