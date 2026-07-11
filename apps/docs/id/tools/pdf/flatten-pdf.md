---
description: "Satukan form dan anotasi ke dalam konten halaman."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 16c40c9b3a4c
---

# Flatten PDF {#flatten-pdf}

Satukan field form interaktif dan anotasi ke dalam konten halaman, menghasilkan PDF statis yang tampil sama di mana pun.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Menerima data form multipart berisi file PDF.

## Parameters {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah PDF dan semua form serta anotasi akan disatukan.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- Ini adalah alat cepat (sinkron) yang mengembalikan hasil secara langsung.
- Nilai field form dipertahankan sebagai teks statis dalam output.
- Anotasi (komentar, sorotan, catatan tempel) menjadi bagian dari konten halaman dan tidak dapat diedit lagi.
