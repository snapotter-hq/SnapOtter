---
description: "Konvertera mellan CSV och Excel (XLSX), i båda riktningarna."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 0bb1e37ac1bb
---

# CSV to Excel {#csv-to-excel}

Konvertera mellan formaten CSV och Excel (XLSX) i båda riktningarna. Ladda upp en CSV- eller TSV-fil för att få XLSX, eller ladda upp en XLSX-fil för att få CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Tar emot multipart-formulärdata med en CSV-, TSV- eller XLSX-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Arbetsbladsnummer att exportera vid konvertering från XLSX (minst 1) |

## Example Request {#example-request}

CSV till Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel till CSV:

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

- Konverteringsriktningen identifieras automatiskt från indatafilens filändelse: `.csv` eller `.tsv` ger `.xlsx`, och `.xlsx` ger `.csv`.
- Parametern `sheet` gäller endast vid konvertering från XLSX. Den väljer vilket arbetsblad som ska exporteras.
- TSV-filer (tabbseparerade värden) stöds vid sidan av CSV.
