---
description: "Menghapus metadata EXIF, GPS, ICC, dan XMP dari gambar untuk privasi dan ukuran file yang lebih kecil."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 522e570f7a41
---

# Hapus Metadata Gambar {#remove-metadata}

Menghapus metadata EXIF, GPS, profil warna ICC, dan XMP dari gambar. Berguna untuk privasi (menghapus koordinat GPS, info kamera) dan mengurangi ukuran file.

## API Endpoints {#api-endpoints}

### Strip Metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Memproses gambar dan mengembalikan versi bersih dengan metadata yang dipilih dihapus.

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Mengembalikan metadata yang telah diurai sebagai JSON tanpa memodifikasi gambar. Berguna untuk melihat pratinjau metadata apa saja yang ada sebelum dihapus.

## Parameters (Strip) {#parameters-strip}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | Menghapus data EXIF (pengaturan kamera, tanggal, dll.) |
| stripGps | boolean | No | `false` | Menghapus data GPS/lokasi saja |
| stripIcc | boolean | No | `false` | Menghapus profil warna ICC |
| stripXmp | boolean | No | `false` | Menghapus metadata XMP (Adobe, IPTC) |
| stripAll | boolean | No | `true` | Menghapus semua metadata sekaligus |

Ketika `stripAll` bernilai `true`, itu menggantikan flag individual dan menghapus segalanya.

## Example Request {#example-request}

Menghapus semua metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Menghapus hanya data GPS (mempertahankan info kamera dan profil warna):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Memeriksa metadata tanpa memodifikasi:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notes {#notes}

- Gambar dienkode ulang dalam format aslinya setelah dihapus. JPEG menggunakan mozjpeg pada kualitas 90, PNG menggunakan level kompresi 9, WebP menggunakan kualitas 85.
- Menghapus profil ICC dapat menyebabkan pergeseran warna yang halus jika gambar ditandai dengan profil non-sRGB. Gunakan `stripIcc: false` jika akurasi warna penting.
- Endpoint inspect mengurai koordinat GPS menjadi nilai lintang/bujur desimal (diawali dengan garis bawah) untuk kemudahan.
- Format masukan yang didukung: JPEG, PNG, WebP, AVIF, TIFF, GIF.
