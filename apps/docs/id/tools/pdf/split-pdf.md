---
description: "Ekstrak halaman atau pisah PDF menjadi beberapa bagian."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 505e8e86e7c4
---

# Split PDF {#split-pdf}

Ekstrak rentang halaman ke dalam PDF baru, atau pisah dokumen menjadi potongan berisi N halaman.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | Mode pemisahan: `range` atau `every` |
| range | string | Ketika mode adalah `range` | - | Rentang halaman dalam sintaks qpdf, mis. `"1-5,8,10-z"` |
| everyN | integer | Ketika mode adalah `every` | - | Pisah menjadi potongan berisi N halaman (1-500) |

## Example Request {#example-request}

Ekstrak halaman tertentu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Pisah menjadi potongan 10 halaman:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- Dalam mode `range`, sebuah PDF tunggal berisi halaman yang dipilih dikembalikan.
- Dalam mode `every`, hasilnya adalah arsip ZIP berisi masing-masing bagian.
- Rentang halaman menggunakan sintaks qpdf: `1-5` untuk halaman 1 sampai 5, `z` untuk halaman terakhir, dan koma untuk menggabungkan rentang (mis. `1-3,7,10-z`).
