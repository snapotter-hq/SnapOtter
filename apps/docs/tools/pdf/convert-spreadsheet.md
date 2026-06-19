---
description: Convert between Excel, OpenDocument, and CSV formats.
---

# Convert Spreadsheet

Convert spreadsheets between Excel (XLSX), OpenDocument Spreadsheet (ODS), and CSV formats. Multi-sheet workbooks export the first sheet when converting to CSV.

## API Endpoint

`POST /api/v1/tools/convert-spreadsheet`

Accepts multipart form data with an Excel/ODS/CSV file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Output format: `xlsx`, `ods`, `csv` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Accepted input formats: `.xlsx`, `.xls`, `.ods`, `.csv`.
- When converting a multi-sheet workbook to CSV, only the first sheet is exported.
- Formulas are evaluated and exported as static values in CSV output.
- The output format must differ from the input format.
