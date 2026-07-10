---
description: "Konversi antar CSV dan Excel (XLSX), kedua arah."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: bccfe71483ad
---

# CSV to Excel {#csv-to-excel}

Konversi antar format CSV dan Excel (XLSX) dalam kedua arah. Unggah file CSV atau TSV untuk mendapatkan XLSX, atau unggah file XLSX untuk mendapatkan CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Menerima multipart form data berisi file CSV, TSV, atau XLSX dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Nomor worksheet yang diekspor saat mengonversi dari XLSX (min 1) |

## Example Request {#example-request}

CSV ke Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel ke CSV:

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

- Arah konversi terdeteksi otomatis dari ekstensi file input: `.csv` atau `.tsv` menghasilkan `.xlsx`, dan `.xlsx` menghasilkan `.csv`.
- Parameter `sheet` hanya berlaku saat mengonversi dari XLSX. Parameter ini memilih worksheet mana yang diekspor.
- File TSV (nilai yang dipisahkan tab) didukung selain CSV.
