---
description: Convert spreadsheets to PDF.
---

# Excel to PDF

Convert Excel, OpenDocument, or CSV spreadsheets to PDF. Wide sheets may paginate across multiple pages.

## API Endpoint

`POST /api/v1/tools/files/excel-to-pdf`

Accepts multipart form data with an Excel/ODS/CSV file.

## Parameters

This tool has no configurable parameters. Upload a spreadsheet and it will be converted to PDF.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Wide sheets may be split across multiple pages in the resulting PDF.
- Charts and conditional formatting are rendered in the PDF output.
- Conversion is handled by LibreOffice running headless on the server.
