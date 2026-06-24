---
description: Split a CSV into smaller files by row count.
---

# Split CSV

Split a large CSV or TSV file into smaller files by row count. Returns a ZIP archive containing the parts.

## API Endpoint

`POST /api/v1/tools/files/split-csv`

Accepts multipart form data with a CSV file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | Number of data rows per output file (1-1,000,000) |
| keepHeader | boolean | No | `true` | Repeat the header row in each output file |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes

- Output is always a ZIP archive containing the split CSV parts, named sequentially (e.g. `part-1.csv`, `part-2.csv`).
- When `keepHeader` is `true`, each part includes the original header row so each file can be used independently.
- Both CSV and TSV files are accepted as input.
- The row count refers to data rows only; the header row is not counted.
