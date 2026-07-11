---
description: "Gabungkan satu atau lebih gambar menjadi dokumen PDF dengan opsi ukuran halaman, orientasi, dan ukuran file target."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 968ad5429bc4
---

# Image to PDF {#image-to-pdf}

Gabungkan satu atau lebih gambar menjadi dokumen PDF. Mendukung beberapa ukuran halaman, orientasi, margin, dan penargetan ukuran file opsional melalui penyesuaian kualitas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Menerima multipart form data dengan satu atau lebih file gambar dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"A4"` | Ukuran halaman: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | No | `"portrait"` | Orientasi halaman: `portrait` atau `landscape` |
| margin | number | No | `20` | Margin halaman dalam poin (0-500) |
| targetSize | object | No | - | Batasan ukuran file target (lihat di bawah) |
| collate | boolean | No | `true` | Gabungkan semua gambar menjadi satu PDF. Bila `false`, membuat satu PDF per gambar. |

### Target Size Object {#target-size-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| value | number | Yes | Nilai ukuran target |
| unit | string | Yes | Unit: `KB` atau `MB` |

Ukuran target minimum adalah 50 KB.

## Example Request {#example-request}

PDF multi-gambar dasar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Dengan target ukuran file:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Satu PDF per gambar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Example Response (Collated) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Example Response (Non-Collated) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Example Response (With Target Size) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notes {#notes}

- Gambar dipusatkan pada halaman dan diskalakan agar pas di dalam margin sambil mempertahankan rasio aspek. Gambar tidak pernah diperbesar.
- Ketika `collate` adalah `false`, setiap gambar menjadi file PDF terpisah, dan unduhannya berupa arsip ZIP yang berisi semua PDF.
- Fitur ukuran target menggunakan pencarian biner iteratif atas tingkat kualitas JPEG (10-95) untuk menemukan kualitas terbaik yang pas dalam anggaran.
- Gambar transparan diratakan ke putih sebelum disematkan ke PDF.
- Format input yang didukung: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG, dan lainnya.
- Orientasi EXIF diterapkan otomatis sebelum penyematan.
