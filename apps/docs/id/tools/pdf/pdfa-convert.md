---
description: "Konversi PDF menjadi format arsip PDF/A-2 untuk pengarsipan jangka panjang."
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: e383a7d5863f
---

# Konverter PDF/A {#pdf-a-convert}

Konversi PDF menjadi format arsip PDF/A-2, cocok untuk pengarsipan jangka panjang dan kepatuhan regulasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Menerima data form multipart berisi file PDF. Tidak diperlukan field `settings`.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Unggah file PDF secara langsung.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- Output sesuai dengan standar PDF/A-2.
- PDF/A menyematkan semua font dan melarang referensi eksternal, sehingga file output mungkin lebih besar dari aslinya.
- Enkripsi dan JavaScript dihapus selama konversi, karena tidak diizinkan oleh standar PDF/A.
