---
description: "Ambil halaman yang dipilih dari PDF ke dalam dokumen baru."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 1f57b82ca534
---

# Extract Pages {#extract-pages}

Ambil halaman yang dipilih dari PDF ke dalam dokumen baru yang lebih kecil.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | Rentang halaman dalam sintaks qpdf, mis. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Rentang halaman menggunakan sintaks qpdf: `1-5` untuk halaman 1 sampai 5, `z` untuk halaman terakhir, dan koma untuk menggabungkan rentang (mis. `1-3,7,10-z`).
- Halaman yang diekstrak mempertahankan format, anotasi, dan tautan aslinya.
