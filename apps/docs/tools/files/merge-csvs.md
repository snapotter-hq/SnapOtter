---
description: Combine multiple CSV or TSV files with matching columns into one.
---

# Merge CSVs {#merge-csvs}

Combine multiple CSV or TSV files with matching columns into a single merged file. All input files must have the same column headers.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Accepts multipart form data with two or more CSV files. No settings field is required.

## Parameters {#parameters}

This tool has no configurable parameters. Upload 2-20 CSV or TSV files with matching column headers.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- Requires between 2 and 20 input files.
- All files must share the same column headers. The merge will fail if columns do not match.
- The header row is included once in the output; data rows from all files are concatenated in upload order.
- Both CSV and TSV files are accepted, but all files in a single request should use the same delimiter.
