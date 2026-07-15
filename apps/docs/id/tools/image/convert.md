---
description: "Konversi gambar antar format termasuk format modern seperti AVIF, JXL, dan HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: c8ad4d0044bd
---

# Konversi Gambar {#convert}

Konversi gambar antar format. Mendukung format web umum serta format khusus seperti HEIC, JXL, BMP, ICO, JP2, QOI, dan PSD.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

Menerima data formulir multipart dengan file gambar dan field JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| format | string | Ya | - | Format target: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Tidak | - | Kualitas output (1-100). Berlaku untuk format lossy seperti jpg, webp, avif, heic. |

## Format Output yang Didukung {#supported-output-formats}

| Format | Tipe | Catatan |
|--------|------|-------|
| jpg | Lossy | JPEG, kompatibilitas terbaik |
| png | Lossless | Mendukung transparansi |
| webp | Keduanya | Format web modern, kompresi baik |
| avif | Lossy | Format generasi baru, kompresi sangat baik |
| tiff | Keduanya | Alur kerja cetak/penerbitan |
| gif | Lossless | Terbatas hingga 256 warna |
| heic / heif | Lossy | Format ekosistem Apple |
| jxl | Keduanya | JPEG XL, format generasi baru |
| bmp | Lossless | Bitmap tanpa kompresi |
| ico | Lossless | Format ikon Windows |
| jp2 | Lossy | JPEG 2000 |
| qoi | Lossless | Format Quite OK Image |
| psd | Berlapis | Adobe Photoshop (memerlukan ImageMagick) |
| ppm | Lossless | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vektor | Encapsulated PostScript |
| tga | Lossless | Format gambar Targa |

## Contoh Permintaan {#example-request}

Konversi ke WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Konversi ke PNG (lossless):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Catatan {#notes}

- Ekstensi nama file output diperbarui otomatis agar sesuai dengan format target.
- Input SVG dirasterisasi pada 300 DPI sebelum konversi.
- Konversi PSD memerlukan ImageMagick terpasang di server.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI, dan TGA menggunakan encoder CLI khusus dan melewati pemrosesan Sharp.
- Encoding HEIC/HEIF menggunakan pustaka encoder HEIC sistem.
- Format input beragam: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, dll.), PSD, SVG, BMP, dan lainnya.
