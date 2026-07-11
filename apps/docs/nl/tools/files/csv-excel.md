---
description: "Converteer tussen CSV en Excel (XLSX), in beide richtingen."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 2cc6e5b8896b
---

# CSV to Excel {#csv-to-excel}

Converteer tussen CSV en Excel (XLSX) formaten in beide richtingen. Upload een CSV- of TSV-bestand om XLSX te krijgen, of upload een XLSX-bestand om CSV te krijgen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Accepteert multipart-formulierdata met een CSV-, TSV- of XLSX-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| sheet | integer | Nee | `1` | Nummer van het werkblad om te exporteren bij conversie vanuit XLSX (min. 1) |

## Example Request {#example-request}

CSV naar Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel naar CSV:

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

- De conversierichting wordt automatisch bepaald op basis van de bestandsextensie van de invoer: `.csv` of `.tsv` levert `.xlsx`, en `.xlsx` levert `.csv`.
- De parameter `sheet` is alleen van toepassing bij conversie vanuit XLSX. Hij selecteert welk werkblad wordt geëxporteerd.
- TSV-bestanden (tab-gescheiden waarden) worden naast CSV ondersteund.
