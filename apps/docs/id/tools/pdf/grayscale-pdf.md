---
description: "Konversi semua warna dalam PDF menjadi skala abu-abu."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 8a597c036b75
---

# Grayscale PDF {#grayscale-pdf}

Konversi semua warna dalam PDF menjadi skala abu-abu, menghasilkan versi hitam-putih dari dokumen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Menerima data form multipart berisi file PDF. Tidak diperlukan field `settings`.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Unggah file PDF secara langsung.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Semua ruang warna (RGB, CMYK) dikonversi menjadi skala abu-abu, termasuk gambar yang tertanam, grafik vektor, dan teks.
- File output sering kali lebih kecil dari aslinya karena data skala abu-abu membutuhkan lebih sedikit byte per piksel.
