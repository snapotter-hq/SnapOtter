---
description: "Converte tra CSV e JSON, in entrambe le direzioni."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: f7113d2bf1c6
---

# CSV to JSON {#csv-to-json}

Converte tra i formati CSV e JSON in entrambe le direzioni. Carica un file CSV o TSV per ottenere un array JSON di oggetti, oppure carica un array JSON per ottenere un file CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Accetta dati form multipart con un file CSV, TSV o JSON e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Formatta l'output JSON con indentazione |

## Example Request {#example-request}

CSV to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- La direzione della conversione viene rilevata automaticamente dall'estensione del file di input: `.csv` o `.tsv` produce `.json`, e `.json` produce `.csv`.
- Il parametro `pretty` influisce solo sull'output JSON. Quando impostato su `false`, l'output è una stringa JSON compatta su una sola riga.
- L'input JSON deve essere un array di oggetti con chiavi coerenti. Ogni oggetto diventa una riga e ogni chiave diventa un'intestazione di colonna.
- I file TSV (valori separati da tabulazioni) sono supportati insieme a CSV.
