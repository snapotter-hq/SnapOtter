---
description: "Susun gambar berlapis dengan posisi, opasitas, dan mode blend untuk komposit."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: ce63a02afd4f
---

# Komposisi Gambar {#image-composition}

Susun gambar overlay di atas gambar dasar dengan posisi, opasitas, dan mode blend yang dapat dikonfigurasi. Berguna untuk mengomposit logo, grafik, atau menggabungkan beberapa gambar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

Menerima data formulir multipart dengan **dua** file gambar dan field JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| x | number | Tidak | `0` | Offset horizontal overlay dari sudut kiri atas dalam piksel (min 0) |
| y | number | Tidak | `0` | Offset vertikal overlay dari sudut kiri atas dalam piksel (min 0) |
| opacity | number | Tidak | `100` | Persentase opasitas overlay (0 hingga 100) |
| blendMode | string | Tidak | `"over"` | Mode blend komposit |

### Mode Blend {#blend-modes}

| Nilai | Deskripsi |
|-------|-------------|
| `over` | Overlay normal (default) |
| `multiply` | Menggelapkan dengan mengalikan nilai piksel |
| `screen` | Mencerahkan dengan membalik, mengalikan, lalu membalik lagi |
| `overlay` | Menggabungkan multiply dan screen berdasarkan kecerahan dasar |
| `darken` | Pertahankan piksel yang lebih gelap dari setiap lapisan |
| `lighten` | Pertahankan piksel yang lebih terang dari setiap lapisan |
| `hard-light` | Overlay kontras kuat |
| `soft-light` | Overlay kontras halus |
| `difference` | Perbedaan absolut antar lapisan |
| `exclusion` | Mirip dengan difference tetapi kontras lebih rendah |

### Field File {#file-fields}

| Nama Field | Wajib | Deskripsi |
|------------|----------|-------------|
| file | Ya | Gambar dasar/latar belakang |
| overlay | Ya | Gambar overlay/latar depan |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Menggunakan mode blend multiply:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Catatan {#notes}

- Kedua gambar divalidasi dan didekode (HEIC, RAW, PSD, SVG didukung) sebelum komposit.
- Overlay ditempatkan pada koordinat piksel tepat yang ditentukan oleh `x` dan `y`. Overlay tidak diubah ukurannya agar pas.
- Jika opasitas kurang dari 100, masker alfa diterapkan pada overlay sebelum blending.
- Overlay dapat melampaui batas gambar dasar (akan dipotong).
- Orientasi EXIF diterapkan otomatis pada kedua gambar sebelum diproses.
- Dimensi output sesuai dengan dimensi gambar dasar.
