---
description: "Converte le presentazioni in PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 5f5739b8c5ec
---

# Da PowerPoint a PDF {#powerpoint-to-pdf}

Converte presentazioni PowerPoint o OpenDocument in PDF, con una diapositiva per pagina.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Accetta dati di form multipart con un file PowerPoint/ODP.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Carica una presentazione e verrà convertita in PDF.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- Formati di input accettati: `.pptx`, `.ppt`, `.odp`.
- Ogni diapositiva diventa una pagina nel PDF.
- La conversione è gestita da LibreOffice in esecuzione headless sul server.
- Animazioni e transizioni non sono incluse nell'output PDF.
