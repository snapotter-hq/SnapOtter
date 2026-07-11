---
description: "Optimalkan gambar untuk pengiriman web dengan konversi format, kontrol kualitas, pengubahan ukuran, dan penghapusan metadata."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: a0eddef99d35
---

# Optimize for Web {#optimize-for-web}

Optimalkan gambar untuk pengiriman web dalam satu langkah. Menggabungkan konversi format, penyesuaian kualitas, pengubahan ukuran opsional, enkode progresif, dan penghapusan metadata.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Menerima multipart form data dengan berkas gambar dan field JSON `settings`.

Endpoint live preview juga tersedia di `POST /api/v1/tools/image/optimize-for-web/preview`, yang mengembalikan gambar yang telah diproses secara langsung sebagai biner (tanpa membuat workspace) untuk penyetelan parameter secara real-time.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | Format output: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | Kualitas output (1-100) |
| maxWidth | number | No | - | Lebar maksimum dalam piksel. Gambar diperkecil jika lebih lebar. |
| maxHeight | number | No | - | Tinggi maksimum dalam piksel. Gambar diperkecil jika lebih tinggi. |
| progressive | boolean | No | `true` | Aktifkan enkode progresif/interlaced |
| stripMetadata | boolean | No | `true` | Hapus metadata EXIF, GPS, ICC, dan XMP |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optimalkan untuk AVIF dengan kompresi agresif:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

Endpoint preview (`/api/v1/tools/image/optimize-for-web/preview`) mengembalikan gambar biner secara langsung dengan header informasional:

- `X-Original-Size` - Ukuran berkas asli dalam byte
- `X-Processed-Size` - Ukuran berkas yang telah diproses dalam byte
- `X-Output-Filename` - Nama berkas output yang telah di-encode URL

## Notes {#notes}

- Alat ini dirancang sebagai pipeline optimasi satu-atap untuk aset web. Alat ini menangani konversi format, penyetelan kualitas, pembatasan dimensi maksimum, dan penghapusan metadata dalam satu lintasan.
- Ekstensi nama berkas output diperbarui agar sesuai dengan format yang dipilih.
- Enkode JXL (JPEG XL) menggunakan enkoder CLI khusus. Gambar diproses terlebih dahulu sebagai PNG, lalu di-encode ke JXL.
- Enkode progresif memperbaiki waktu muat yang dirasakan untuk JPEG dan PNG dengan memungkinkan peramban merender pratinjau kualitas rendah sebelum gambar penuh selesai dimuat.
- Endpoint preview lebih ringan (tanpa pembuatan workspace/job) dan ditujukan untuk UI penyetelan parameter live di frontend.
