---
description: "Converte file Word, Markdown, HTML o testo semplice in EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 38422d4492ff
---

# Converti in EPUB {#convert-to-epub}

Converte documenti Word, Markdown, HTML o file di testo semplice nel formato e-book EPUB.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Accetta dati di form multipart con un file Word/Markdown/HTML/TXT.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Carica un documento e verrà convertito in EPUB.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Esempio di risposta {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Note {#notes}

- Formati di input accettati: `.docx`, `.md`, `.html`, `.txt`.
- L'output EPUB segue la specifica EPUB 3.
- Le intestazioni del documento di origine vengono usate per generare l'indice.
- La conversione è gestita da Pandoc sul server.
