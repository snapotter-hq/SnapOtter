---
description: "Converte documenti Word in PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 3c609fdeac12
---

# Da Word a PDF {#word-to-pdf}

Converte documenti Word, testo OpenDocument, RTF o file di testo semplice in PDF.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Accetta dati di form multipart con un file Word/ODT/RTF/TXT.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Carica un documento e verrà convertito in PDF.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Formati di input accettati: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- La conversione è gestita da LibreOffice in esecuzione headless sul server.
- I font incorporati nel documento vengono usati quando disponibili; altrimenti vengono sostituiti con i font di sistema.
- Intestazioni, piè di pagina, tabelle e immagini sono mantenuti nell'output PDF.
