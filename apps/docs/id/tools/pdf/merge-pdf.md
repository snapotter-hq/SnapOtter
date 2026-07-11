---
description: "Gabungkan beberapa PDF menjadi satu dokumen."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: efe65253810d
---

# Merge PDFs {#merge-pdfs}

Gabungkan dua atau lebih file PDF menjadi satu dokumen, mempertahankan urutan halaman setiap file input.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Menerima data form multipart berisi dua atau lebih file PDF. Tidak diperlukan field `settings`.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Cukup unggah dua atau lebih file PDF.

| Constraint | Value |
|------------|-------|
| Minimum files | 2 |
| Maximum files | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- File digabungkan sesuai urutan pengunggahannya.
- Diperlukan setidaknya dua file PDF; permintaan akan gagal dengan error 400 jika kurang dari itu.
- Jumlah maksimum file input adalah 20.
- PDF terenkripsi harus dibuka kuncinya sebelum digabungkan.
