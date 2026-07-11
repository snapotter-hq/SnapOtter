---
description: "Konversi GIF beranimasi ke WebP dan sebaliknya, mempertahankan semua frame."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: c056ac167026
---

# GIF/WebP Converter {#gif-webp-converter}

Konversi file GIF beranimasi ke WebP dan sebaliknya, mempertahankan semua frame dan timing animasi. Animasi WebP umumnya 25-35% lebih kecil daripada GIF yang setara.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Menerima multipart form data dengan file GIF atau WebP dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | integer | No | `80` | Kualitas output untuk encoding WebP (1-100) |
| lossless | boolean | No | `false` | Gunakan kompresi WebP lossless |
| resizePercent | integer | No | `100` | Skala output berdasarkan persentase (10-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notes {#notes}

- Hanya file `.gif` dan `.webp` yang diterima. Format gambar lain tidak didukung oleh alat ini.
- Arah konversi bersifat otomatis: input GIF menghasilkan output WebP, dan input WebP menghasilkan output GIF.
- Opsi `quality` dan `lossless` hanya berlaku saat encoding ke WebP. Saat mengonversi ke GIF, output menggunakan palet GIF standar.
- Gunakan `resizePercent` untuk memperkecil dimensi (dan ukuran file) animasi berukuran besar.
