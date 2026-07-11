---
description: "Konversi antar format Excel, OpenDocument, dan CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 1602c02777fb
---

# Convert Spreadsheet {#convert-spreadsheet}

Konversi spreadsheet antar format Excel (XLSX), OpenDocument Spreadsheet (ODS), dan CSV. Workbook multi-sheet mengekspor sheet pertama saat dikonversi ke CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Menerima multipart form data berisi file Excel/ODS/CSV dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Format output: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

Mengembalikan `202 Accepted`. Lacak progres melalui SSE di `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Format input yang diterima: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Saat mengonversi workbook multi-sheet ke CSV, hanya sheet pertama yang diekspor.
- Formula dievaluasi dan diekspor sebagai nilai statis dalam output CSV.
- Format output harus berbeda dari format input.
