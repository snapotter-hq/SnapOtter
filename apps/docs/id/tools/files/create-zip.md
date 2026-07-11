---
description: "Gabungkan beberapa file menjadi satu arsip ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: ba9c03e72009
---

# Create ZIP {#create-zip}

Gabungkan beberapa file dari jenis apa pun menjadi satu arsip ZIP. Nama file duplikat secara otomatis dideduplikasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Menerima multipart form data berisi dua file atau lebih. Tidak diperlukan field settings.

## Parameters {#parameters}

Tool ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah 2-50 file dari jenis apa pun untuk digabungkan.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Memerlukan antara 2 hingga 50 file input.
- Jenis file apa pun diterima; tidak ada batasan pada format input.
- Jika beberapa file memiliki nama yang sama, file tersebut secara otomatis dideduplikasi dengan sufiks numerik.
- Arsip output menggunakan kompresi ZIP standar (deflate).
