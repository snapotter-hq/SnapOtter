---
description: "Linearisasi PDF untuk tampilan web yang cepat (unduhan progresif)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: da57d3bd0c65
---

# Web-Optimize PDF {#web-optimize-pdf}

Linearisasi PDF agar dapat diunduh dan ditampilkan secara progresif di peramban web tanpa menunggu file lengkap.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Menerima data form multipart berisi file PDF. Tidak diperlukan field `settings`.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Unggah file PDF secara langsung.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Linearisasi menyusun ulang struktur internal PDF sehingga halaman pertama dapat dirender sebelum file lengkap selesai diunduh.
- File output mungkin sedikit lebih besar dari input karena data linearisasi yang ditambahkan.
- PDF yang sudah dilinearisasi akan dilinearisasi ulang tanpa masalah.
