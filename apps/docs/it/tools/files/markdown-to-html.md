---
description: "Converte un file Markdown in una pagina HTML autonoma."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: a71d66aa0251
---

# Markdown to HTML {#markdown-to-html}

Converte un file Markdown in una pagina HTML autonoma. Le immagini remote referenziate nella sorgente vengono lasciate invariate nell'output.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Accetta dati form multipart con un file Markdown.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un file Markdown e verrà convertito in HTML.

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

- Formati di input accettati: `.md`, `.markdown`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- L'output è una pagina HTML autonoma con stili inline.
- Gli URL delle immagini remote nella sorgente Markdown vengono preservati invariati e non recuperati.
