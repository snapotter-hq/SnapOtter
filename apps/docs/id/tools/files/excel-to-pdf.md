---
description: "Konversi spreadsheet ke PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: cf5be447771f
---

# Excel to PDF {#excel-to-pdf}

Konversi spreadsheet Excel, OpenDocument, atau CSV ke PDF. Sheet yang lebar dapat dipaginasi menjadi beberapa halaman.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Menerima multipart form data berisi file Excel/ODS/CSV.

## Parameters {#parameters}

Tool ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah spreadsheet dan file tersebut akan dikonversi ke PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Sheet yang lebar dapat dipecah menjadi beberapa halaman dalam PDF yang dihasilkan.
- Grafik dan pemformatan bersyarat dirender dalam output PDF.
- Konversi ditangani oleh LibreOffice yang berjalan headless di server.
