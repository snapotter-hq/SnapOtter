---
description: "Menyusun halaman PDF untuk dilipat menjadi buklet."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: f8d7e1a5e2f7
---

# Booklet PDF {#booklet-pdf}

Menyusun halaman untuk pencetakan dupleks sehingga lembar yang tercetak dapat dilipat menjadi buklet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Menerima data formulir multipart dengan sebuah file PDF dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Halaman per lembar: `2`, `4`, `6`, atau `8` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Default `perSheet: 2` menempatkan dua halaman berdampingan pada setiap lembar, yang merupakan tata letak buklet standar untuk pencetakan dupleks.
- Halaman kosong ditambahkan secara otomatis jika jumlah total halaman bukan kelipatan dari ukuran lembar.
- Cetak keluaran secara dua sisi pada penjilidan tepi-pendek, lalu lipat dan staples.
