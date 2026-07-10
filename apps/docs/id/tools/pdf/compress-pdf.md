---
description: "Perkecil ukuran file PDF dengan mengompresi gambar yang tertanam."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 3e03cf496906
---

# Compress PDF {#compress-pdf}

Kurangi ukuran file PDF dengan menurunkan resolusi gambar yang tertanam. Pilih antara penggeser kualitas atau ukuran file target.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Mode kompresi: `quality` atau `targetSize` |
| quality | integer | No | `75` | Kualitas kompresi, 1-100 (lebih tinggi = kompresi lebih sedikit). Digunakan dalam mode `quality` |
| targetSizeKb | number | No | - | Ukuran file target dalam kilobyte. Digunakan dalam mode `targetSize` |

## Example Request {#example-request}

Kompresi berdasarkan kualitas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Kompresi ke ukuran target:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Dalam mode `quality`, nilai yang lebih rendah menghasilkan file yang lebih kecil dengan degradasi gambar yang lebih besar.
- Dalam mode `targetSize`, pencarian biner menemukan DPI tertinggi yang sesuai dengan ukuran yang diminta.
- Jika kompresi malah memperbesar file, byte asli dikembalikan tanpa perubahan.
- Konten teks dan vektor tidak terpengaruh; hanya gambar raster yang tertanam yang diturunkan resolusinya.
