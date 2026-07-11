---
description: "Konvertera mellan CSV och JSON, i båda riktningarna."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: cc278b26876a
---

# CSV to JSON {#csv-to-json}

Konvertera mellan formaten CSV och JSON i båda riktningarna. Ladda upp en CSV- eller TSV-fil för att få en JSON-array av objekt, eller ladda upp en JSON-array för att få en CSV-fil.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Tar emot multipart-formulärdata med en CSV-, TSV- eller JSON-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Formatera JSON-utdata snyggt med indrag |

## Example Request {#example-request}

CSV till JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON till CSV:

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

- Konverteringsriktningen identifieras automatiskt från indatafilens filändelse: `.csv` eller `.tsv` ger `.json`, och `.json` ger `.csv`.
- Parametern `pretty` påverkar endast JSON-utdata. När den är satt till `false` blir utdata en kompakt JSON-sträng på en enda rad.
- JSON-indata måste vara en array av objekt med konsekventa nycklar. Varje objekt blir en rad, och varje nyckel blir en kolumnrubrik.
- TSV-filer (tabbseparerade värden) stöds vid sidan av CSV.
