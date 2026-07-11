---
description: "Linearizza un PDF per una visualizzazione web rapida (download progressivo)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 0215b1977434
---

# Ottimizza PDF per il web {#web-optimize-pdf}

Linearizza un PDF in modo che possa essere scaricato e visualizzato progressivamente nei browser web senza attendere il file completo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Accetta dati di form multipart con un file PDF. Non è richiesto alcun campo `settings`.

## Parameters {#parameters}

Questo strumento non ha parametri di configurazione. Carica direttamente il file PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- La linearizzazione riorganizza la struttura interna del PDF in modo che la prima pagina possa essere renderizzata prima che il file completo sia stato scaricato.
- Il file di output potrebbe essere leggermente più grande dell'input a causa dei dati di linearizzazione aggiunti.
- I PDF già linearizzati vengono ri-linearizzati senza problemi.
