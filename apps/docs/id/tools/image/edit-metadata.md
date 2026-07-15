---
description: "Edit field metadata EXIF, IPTC, GPS, dan XMP dalam gambar tanpa mengenkode ulang piksel."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 9e6badffd745
---

# Sunting Metadata Gambar {#edit-metadata}

Edit field metadata gambar termasuk EXIF, IPTC, koordinat GPS, tanggal, dan kata kunci. Menggunakan ExifTool di baliknya, sehingga metadata ditulis di tempat tanpa mengenkode ulang piksel, mempertahankan kualitas gambar penuh.

## API Endpoint {#api-endpoints}

### Edit Metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Menulis field metadata ke gambar dan mengembalikan file yang dimodifikasi.

### Inspeksi Metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Mengembalikan metadata lengkap dari gambar via ExifTool sebagai JSON. Tidak memodifikasi gambar.

## Parameter (Edit) {#parameters-edit}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| title | string | Tidak | - | Judul gambar (XMP/EXIF) |
| author | string | Tidak | - | Nama penulis |
| artist | string | Tidak | - | Nama artis (tag EXIF Artist) |
| copyright | string | Tidak | - | Pemberitahuan hak cipta |
| imageDescription | string | Tidak | - | Deskripsi gambar (EXIF) |
| software | string | Tidak | - | Tag perangkat lunak |
| dateTime | string | Tidak | - | Nilai EXIF DateTime |
| dateTimeOriginal | string | Tidak | - | Nilai EXIF DateTimeOriginal |
| setAllDates | string | Tidak | - | Atur semua field tanggal sekaligus |
| dateShift | string | Tidak | - | Geser semua tanggal berdasarkan offset (format: `+HH:MM` atau `-HH:MM`) |
| clearGps | boolean | Tidak | `false` | Hapus semua data GPS |
| gpsLatitude | number | Tidak | - | Atur lintang GPS (-90 hingga 90) |
| gpsLongitude | number | Tidak | - | Atur bujur GPS (-180 hingga 180) |
| gpsAltitude | number | Tidak | - | Atur ketinggian GPS dalam meter |
| keywords | string[] | Tidak | - | Kata kunci/tag yang ditambahkan atau diatur |
| keywordsMode | string | Tidak | `"add"` | Cara menangani kata kunci: `add` (tambahkan) atau `set` (ganti) |
| fieldsToRemove | string[] | Tidak | `[]` | Daftar nama field metadata spesifik yang dihapus |
| iptcTitle | string | Tidak | - | IPTC Object Name |
| iptcHeadline | string | Tidak | - | IPTC Headline |
| iptcCity | string | Tidak | - | IPTC City |
| iptcState | string | Tidak | - | IPTC Province/State |
| iptcCountry | string | Tidak | - | IPTC Country |

## Contoh Permintaan {#example-request}

Atur penulis dan hak cipta:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Atur koordinat GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Hapus GPS dan tambahkan kata kunci:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Inspeksi metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Contoh Respons (Edit) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Catatan {#notes}

- Alat ini memerlukan ExifTool terpasang di server. Ini sudah disertakan dalam image Docker.
- Metadata ditulis di tempat, sehingga tidak terjadi enkode ulang piksel. Perubahan ukuran file minimal (hanya byte metadata).
- Parameter `dateShift` menggeser semua field tanggal berdasarkan offset yang ditentukan, berguna untuk memperbaiki kesalahan zona waktu (mis. `+02:00` atau `-05:30`).
- Jika tidak ada perubahan yang diminta (semua parameter dihilangkan atau kosong), file asli dikembalikan tanpa perubahan.
- Format yang didukung: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Untuk format yang tidak dapat dipratinjau di browser (HEIF, TIFF), respons menyertakan field `previewUrl` dengan pratinjau WebP.
