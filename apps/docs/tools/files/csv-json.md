---
description: Convert between CSV and JSON, both directions.
---

# CSV to JSON {#csv-to-json}

Convert between CSV and JSON formats in both directions. Upload a CSV or TSV file to get a JSON array of objects, or upload a JSON array to get a CSV file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Accepts multipart form data with a CSV, TSV, or JSON file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Pretty-print JSON output with indentation |

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

- Conversion direction is auto-detected from the input file extension: `.csv` or `.tsv` produces `.json`, and `.json` produces `.csv`.
- The `pretty` parameter only affects JSON output. When set to `false`, the output is a compact single-line JSON string.
- JSON input must be an array of objects with consistent keys. Each object becomes a row, and each key becomes a column header.
- TSV (tab-separated values) files are supported alongside CSV.
