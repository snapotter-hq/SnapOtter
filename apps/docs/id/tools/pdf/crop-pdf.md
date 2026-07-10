---
description: "Pangkas semua halaman PDF dengan margin yang seragam."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 5e53a4812439
---

# Crop PDF {#crop-pdf}

Pangkas semua halaman PDF dengan menerapkan margin yang seragam, memotong konten dari setiap tepi secara merata.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | Margin pemangkasan seragam dalam poin (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Nilai margin dinyatakan dalam poin PDF (1 poin = 1/72 inci).
- Margin yang sama diterapkan ke keempat tepi setiap halaman.
- Margin sebesar `0` menghapus semua margin pemangkasan yang ada, menampilkan seluruh media box.
