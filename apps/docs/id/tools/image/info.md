---
description: "Lihat metadata gambar terperinci, properti, dan statistik histogram per-channel."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: d007549742c9
---

# Image Info {#image-info}

Alat analisis read-only yang mengembalikan metadata gambar komprehensif termasuk dimensi, format, ruang warna, keberadaan EXIF/ICC/XMP, dan statistik histogram per-channel. Tidak menghasilkan file output yang telah diproses.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/info`

Menerima multipart form data dengan file gambar. Tidak diperlukan field pengaturan.

## Parameters {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Cukup unggah file gambar.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Gambar yang akan dianalisis |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Nama file yang telah disanitasi |
| fileSize | number | Ukuran file dalam byte |
| width | number | Lebar gambar dalam piksel |
| height | number | Tinggi gambar dalam piksel |
| format | string | Format yang terdeteksi (jpeg, png, webp, dll.) |
| channels | number | Jumlah channel warna |
| hasAlpha | boolean | Apakah gambar memiliki channel alpha |
| colorSpace | string | Ruang warna (srgb, cmyk, dll.) |
| density | number or null | Resolusi DPI/PPI |
| isProgressive | boolean | Apakah JPEG menggunakan encoding progresif |
| orientation | number or null | Nilai orientasi EXIF (1-8) |
| hasProfile | boolean | Apakah ada profil ICC yang tersemat |
| hasExif | boolean | Apakah metadata EXIF ada |
| hasIcc | boolean | Apakah profil warna ICC ada |
| hasXmp | boolean | Apakah metadata XMP ada |
| bitDepth | string or null | Bit per sampel |
| pages | number | Jumlah halaman (untuk format multi-halaman seperti TIFF, GIF) |
| histogram | array | Statistik per-channel (min, max, mean, deviasi standar) |

## Notes {#notes}

- Ini adalah endpoint read-only. Ia tidak menghasilkan file output yang dapat diunduh atau sebuah `jobId`.
- Untuk gambar format RAW (DNG, CR2, NEF, ARW, dll.), ExifTool digunakan untuk mengekstrak dimensi sensor asli dan flag metadata yang tidak dapat dibaca Sharp secara langsung.
- File HEIC/HEIF di-decode ke PNG secara internal untuk mengekstrak statistik piksel, karena Sharp tidak dapat men-decode piksel HEVC.
- Histogram menyediakan min/max/mean/stdev per channel, bukan distribusi 256-bin penuh.
- Field `density` mencerminkan metadata DPI yang tersemat, bila ada.
