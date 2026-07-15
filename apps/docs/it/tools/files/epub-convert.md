---
description: "Converte un EPUB in PDF, DOCX, HTML o Markdown."
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: bc94d0ccdea1
---

# Converti da EPUB {#convert-epub}

Converte un e-book EPUB in PDF, Word (DOCX), HTML o Markdown. Le risorse remote all'interno del libro non vengono recuperate.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Accetta dati form multipart con un file EPUB e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Formato di output: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato di input accettato: `.epub`.
- Le risorse remote incorporate nell'EPUB (immagini e font esterni) non vengono recuperate per motivi di sicurezza.
- La fedeltà delle immagini nell'output convertito può variare a seconda della struttura dell'EPUB.
- La conversione è gestita da Pandoc sul server.
