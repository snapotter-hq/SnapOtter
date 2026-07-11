---
description: "Tenta di riparare un PDF danneggiato o corrotto."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 13fbc054b3d9
---

# Ripara PDF {#repair-pdf}

Tenta di riparare un PDF danneggiato o corrotto ricostruendone la struttura interna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Accetta dati di form multipart con un file PDF. Non è richiesto alcun campo `settings`.

## Parameters {#parameters}

Questo strumento non ha parametri di configurazione. Carica direttamente il file PDF danneggiato.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- La validazione strutturale viene saltata in fase di input per lasciar passare i file malformati.
- La riparazione è al meglio delle possibilità; i file gravemente corrotti potrebbero non essere completamente recuperabili.
- Il PDF riparato potrebbe differire leggermente nelle dimensioni dall'originale a causa delle tabelle di riferimento incrociato ricostruite.
