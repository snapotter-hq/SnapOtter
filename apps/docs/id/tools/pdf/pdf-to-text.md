---
description: "Ekstrak teks biasa dari PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: fa7cfd6526d0
---

# PDF to Text {#pdf-to-text}

Ekstrak semua teks biasa yang dapat dibaca dari dokumen PDF ke dalam file teks.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Menerima data form multipart berisi file PDF.

## Parameters {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah PDF dan konten teksnya akan diekstrak.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- Ini adalah alat cepat (sinkron) yang mengembalikan hasil secara langsung.
- Field `chars` dalam respons menunjukkan jumlah karakter yang diekstrak.
- Hanya teks yang tertanam secara digital yang diekstrak. Untuk dokumen hasil pindai atau PDF berbasis gambar, gunakan alat [PDF OCR](./ocr-pdf).
