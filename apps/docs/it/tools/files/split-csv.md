---
description: "Divide un CSV in file più piccoli in base al numero di righe."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: e6add1c01c9b
---

# Dividi CSV {#split-csv}

Divide un file CSV o TSV di grandi dimensioni in file più piccoli in base al numero di righe. Restituisce un archivio ZIP contenente le parti.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Accetta dati di form multipart con un file CSV e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | Numero di righe di dati per file di output (1-1.000.000) |
| keepHeader | boolean | No | `true` | Ripete la riga di intestazione in ogni file di output |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Note {#notes}

- L'output è sempre un archivio ZIP contenente le parti CSV divise, denominate in sequenza (ad es. `part-1.csv`, `part-2.csv`).
- Quando `keepHeader` è `true`, ogni parte include la riga di intestazione originale così che ogni file possa essere usato in modo indipendente.
- Sono accettati come input sia file CSV che TSV.
- Il conteggio delle righe si riferisce solo alle righe di dati; la riga di intestazione non viene conteggiata.
