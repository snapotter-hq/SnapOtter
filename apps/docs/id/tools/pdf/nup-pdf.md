---
description: "Susun beberapa halaman PDF per lembar (2-up, 4-up, dll.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: f41409f0d574
---

# Halaman Per Lembar (N-up) {#n-up-pdf}

Susun beberapa halaman per lembar untuk menghemat kertas saat mencetak, seperti tata letak 2-up atau 4-up.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Halaman per lembar: `2`, `3`, `4`, `8`, `9`, `12`, atau `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Halaman disusun dalam urutan baca (kiri ke kanan, atas ke bawah).
- Ukuran halaman output sama dengan aslinya; masing-masing halaman diperkecil agar pas dengan grid.
- Dokumen 20 halaman dengan `perSheet: 4` menghasilkan output 5 halaman.
