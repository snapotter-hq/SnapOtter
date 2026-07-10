---
description: "Menajamkan gambar menggunakan metode adaptive, unsharp mask, atau high-pass dengan pengurangan noise opsional."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: 1990226b51e3
---

# Sharpening {#sharpening}

Alat penajaman lanjutan dengan tiga metode: adaptive (cerdas dan sadar-tepi), unsharp mask (radius/amount klasik), dan high-pass (penekanan tekstur). Menyertakan pengurangan noise bawaan untuk mencegah artefak penajaman.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Menerima data formulir multipart dengan sebuah file gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | Algoritma penajaman: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | Adaptive: sigma Gaussian (0.5 hingga 10) |
| m1 | number | No | `1.0` | Adaptive: penajaman area datar (0 hingga 10) |
| m2 | number | No | `3.0` | Adaptive: penajaman area bergerigi (0 hingga 20) |
| x1 | number | No | `2.0` | Adaptive: ambang datar/bergerigi (0 hingga 10) |
| y2 | number | No | `12` | Adaptive: penajaman datar maksimum (0 hingga 50) |
| y3 | number | No | `20` | Adaptive: penajaman bergerigi maksimum (0 hingga 50) |
| amount | number | No | `100` | Unsharp mask: jumlah penajaman (0 hingga 1000) |
| radius | number | No | `1.0` | Unsharp mask: radius blur dalam piksel (0.1 hingga 5) |
| threshold | number | No | `0` | Unsharp mask: perbedaan kecerahan minimum untuk menajamkan (0 hingga 255) |
| strength | number | No | `50` | High-pass: kekuatan filter (0 hingga 100) |
| kernelSize | number | No | `3` | High-pass: ukuran kernel konvolusi (3 atau 5) |
| denoise | string | No | `"off"` | Pengurangan noise sebelum penajaman: `off`, `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Unsharp mask dengan threshold untuk melindungi area yang halus:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes {#notes}

- Hanya parameter yang relevan dengan metode yang dipilih yang digunakan. Misalnya, `amount`, `radius`, dan `threshold` diabaikan ketika `method` bernilai `adaptive`.
- Metode adaptive menggunakan penajaman adaptif bawaan Sharp dengan perilaku area datar/bergerigi yang dapat dikonfigurasi.
- Opsi `denoise` menerapkan pengurangan noise sebelum penajaman untuk mencegah penguatan noise/grain.
- Penajaman high-pass mengekstrak detail halus dengan mengurangi versi yang di-blur dari gambar asli, lalu memadukannya kembali.
- Format keluaran mengikuti format masukan. Masukan HEIC, RAW, PSD, dan SVG otomatis didekode sebelum diproses.
