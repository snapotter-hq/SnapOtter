---
description: "Converte un file Markdown in un PDF con stile applicato."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 42e8f4ba7047
---

# Da Markdown a PDF {#markdown-to-pdf}

Converte un file Markdown in un documento PDF con stile applicato. Le risorse remote sono disabilitate per motivi di privacy.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Accetta dati di form multipart con un file Markdown.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Carica un file Markdown e verrà convertito in PDF.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Formati di input accettati: `.md`, `.markdown`.
- Le risorse remote (immagini, fogli di stile referenziati tramite URL) non vengono scaricate per motivi di privacy e sicurezza.
- Il Markdown viene prima renderizzato in HTML, poi convertito in PDF tramite WeasyPrint.
- Blocchi di codice, tabelle e altri elementi Markdown vengono formattati nell'output PDF.
