---
description: "Combina più file CSV o TSV con colonne corrispondenti in un unico file."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 09972600d643
---

# Unisci CSV {#merge-csvs}

Combina più file CSV o TSV con colonne corrispondenti in un unico file unito. Tutti i file di input devono avere le stesse intestazioni di colonna.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Accetta dati di form multipart con due o più file CSV. Non è richiesto alcun campo di impostazioni.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Carica da 2 a 20 file CSV o TSV con intestazioni di colonna corrispondenti.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Note {#notes}

- Richiede tra 2 e 20 file di input.
- Tutti i file devono condividere le stesse intestazioni di colonna. L'unione fallisce se le colonne non corrispondono.
- La riga di intestazione è inclusa una sola volta nell'output; le righe di dati di tutti i file vengono concatenate nell'ordine di caricamento.
- Sono accettati sia file CSV che TSV, ma tutti i file di una singola richiesta dovrebbero usare lo stesso delimitatore.
