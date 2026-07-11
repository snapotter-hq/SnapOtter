---
description: "Konversi antar CSV dan JSON, kedua arah."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 690573599e35
---

# CSV to JSON {#csv-to-json}

Konversi antar format CSV dan JSON dalam kedua arah. Unggah file CSV atau TSV untuk mendapatkan array objek JSON, atau unggah array JSON untuk mendapatkan file CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Menerima multipart form data berisi file CSV, TSV, atau JSON dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Cetak-rapi output JSON dengan indentasi |

## Example Request {#example-request}

CSV ke JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON ke CSV:

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

- Arah konversi terdeteksi otomatis dari ekstensi file input: `.csv` atau `.tsv` menghasilkan `.json`, dan `.json` menghasilkan `.csv`.
- Parameter `pretty` hanya memengaruhi output JSON. Ketika diatur ke `false`, output berupa string JSON satu baris yang kompak.
- Input JSON harus berupa array objek dengan key yang konsisten. Setiap objek menjadi baris, dan setiap key menjadi header kolom.
- File TSV (nilai yang dipisahkan tab) didukung selain CSV.
