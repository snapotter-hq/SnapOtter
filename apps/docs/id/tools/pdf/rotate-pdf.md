---
description: "Putar halaman dalam PDF sebesar 90, 180, atau 270 derajat."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: e1d10c33b072
---

# Rotate PDF {#rotate-pdf}

Putar semua atau halaman yang dipilih dalam PDF sebesar sudut yang ditentukan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | Sudut rotasi: `90`, `180`, atau `270` |
| range | string | No | `"1-z"` | Rentang halaman dalam sintaks qpdf, mis. `"1-5,8"` (`"1-z"` = semua halaman) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Rotasi searah jarum jam.
- Rentang halaman menggunakan sintaks qpdf: `1-5` untuk halaman 1 sampai 5, `z` untuk halaman terakhir, dan koma untuk menggabungkan rentang.
- Rentang default `"1-z"` memutar semua halaman.
