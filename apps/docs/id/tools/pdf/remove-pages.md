---
description: "Hapus halaman tertentu dari PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 380fc45dd7ec
---

# Remove Pages {#remove-pages}

Hapus halaman tertentu dari PDF, menjaga semua halaman lainnya tetap utuh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | Rentang halaman yang akan dihapus dalam sintaks qpdf, mis. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Anda tidak dapat menghapus setiap halaman dari dokumen; setidaknya satu halaman harus tersisa.
- Rentang halaman menggunakan sintaks qpdf: `3` untuk satu halaman, `5-7` untuk rentang, dan koma untuk menggabungkan (mis. `1,3,5-7`).
