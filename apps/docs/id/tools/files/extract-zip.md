---
description: "Ekstrak file dari arsip ZIP dengan aman disertai perlindungan bomb."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 70a363ab5d2a
---

# Extract ZIP {#extract-zip}

Ekstrak file dari arsip ZIP dengan aman. Arsip berisi satu file mengembalikan file yang terkandung secara langsung; arsip berisi banyak file mengembalikan ZIP datar dengan konten yang telah diekstrak.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Menerima multipart form data berisi file ZIP. Tidak diperlukan field settings.

## Parameters {#parameters}

Tool ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah file `.zip` untuk diekstrak.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Hanya file `.zip` yang diterima sebagai input.
- Jika arsip berisi satu file, file tersebut dikembalikan secara langsung (tidak dibungkus dalam ZIP).
- Jika arsip berisi banyak file, ZIP datar dikembalikan dengan semua file diekstrak ke level root (struktur direktori bersarang diratakan).
- Perlindungan bomb bawaan menolak arsip dengan rasio kompresi atau jumlah file yang berlebihan untuk mencegah penipisan sumber daya.
