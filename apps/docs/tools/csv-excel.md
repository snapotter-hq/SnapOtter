---
description: Convert between CSV and Excel (XLSX), both directions.
---

# CSV to Excel

Convert between CSV and Excel (XLSX) formats in both directions. Upload a CSV or TSV file to get XLSX, or upload an XLSX file to get CSV.

## API Endpoint

`POST /api/v1/tools/csv-excel`

Accepts multipart form data with a CSV, TSV, or XLSX file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Worksheet number to export when converting from XLSX (min 1) |

## Example Request

CSV to Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes

- Conversion direction is auto-detected from the input file extension: `.csv` or `.tsv` produces `.xlsx`, and `.xlsx` produces `.csv`.
- The `sheet` parameter only applies when converting from XLSX. It selects which worksheet to export.
- TSV (tab-separated values) files are supported alongside CSV.
