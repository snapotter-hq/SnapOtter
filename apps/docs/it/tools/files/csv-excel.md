---
description: "Converte tra CSV ed Excel (XLSX), in entrambe le direzioni."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 70059ad4858f
---

# CSV to Excel {#csv-to-excel}

Converte tra i formati CSV ed Excel (XLSX) in entrambe le direzioni. Carica un file CSV o TSV per ottenere XLSX, oppure carica un file XLSX per ottenere CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Accetta dati form multipart con un file CSV, TSV o XLSX e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Numero del foglio di lavoro da esportare quando si converte da XLSX (min 1) |

## Example Request {#example-request}

CSV to Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- La direzione della conversione viene rilevata automaticamente dall'estensione del file di input: `.csv` o `.tsv` produce `.xlsx`, e `.xlsx` produce `.csv`.
- Il parametro `sheet` si applica solo quando si converte da XLSX. Seleziona quale foglio di lavoro esportare.
- I file TSV (valori separati da tabulazioni) sono supportati insieme a CSV.
