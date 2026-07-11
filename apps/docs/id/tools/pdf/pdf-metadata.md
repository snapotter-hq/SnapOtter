---
description: "Baca dan tulis metadata dokumen PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 0d6421d2d529
---

# PDF Metadata {#pdf-metadata}

Baca dan perbarui field metadata dokumen PDF seperti judul, penulis, subjek, dan kata kunci. Jika tidak ada pengaturan yang diberikan, metadata yang ada dikembalikan tanpa modifikasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Judul dokumen (maks 500 karakter) |
| author | string | No | - | Penulis dokumen (maks 500 karakter) |
| subject | string | No | - | Subjek dokumen (maks 500 karakter) |
| keywords | string | No | - | Kata kunci dokumen (maks 500 karakter) |

Semua parameter bersifat opsional. Field yang dihilangkan dibiarkan tidak berubah.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- Ini adalah alat cepat (sinkron) yang mengembalikan hasil secara langsung.
- Field `metadata` dalam respons berisi metadata hasil setelah pembaruan apa pun.
- Untuk membaca metadata tanpa memodifikasinya, hilangkan field `settings` atau kirim objek kosong.
- Setiap field metadata dibatasi hingga 500 karakter.
