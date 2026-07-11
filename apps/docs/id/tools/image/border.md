---
description: "Tambahkan bingkai, padding, sudut membulat, dan bayangan jatuh ke gambar dalam urutan yang dapat diprediksi dan dikendalikan."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 5945278283d8
---

# Bingkai & Frame {#border-frame}

Tambahkan bingkai, padding, sudut membulat, dan bayangan jatuh ke gambar. Alat ini menerapkan efek dalam urutan: padding, bingkai, radius sudut, lalu bayangan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| borderWidth | number | Tidak | 10 | Ketebalan bingkai dalam piksel (0 hingga 2000) |
| borderColor | string | Tidak | `"#000000"` | Warna bingkai sebagai hex (mis. `#FF0000`) |
| padding | number | Tidak | 0 | Padding dalam antara gambar dan bingkai dalam piksel (0 hingga 200) |
| paddingColor | string | Tidak | `"#FFFFFF"` | Warna isian padding sebagai hex |
| cornerRadius | number | Tidak | 0 | Radius sudut dalam piksel (0 hingga 2000) |
| shadow | boolean | Tidak | `false` | Apakah akan menambahkan bayangan jatuh |
| shadowBlur | number | Tidak | 15 | Radius blur bayangan (1 hingga 200) |
| shadowOffsetX | number | Tidak | 0 | Offset horizontal bayangan (-50 hingga 50) |
| shadowOffsetY | number | Tidak | 5 | Offset vertikal bayangan (-50 hingga 50) |
| shadowColor | string | Tidak | `"#000000"` | Warna bayangan sebagai hex |
| shadowOpacity | number | Tidak | 40 | Persentase opasitas bayangan (0 hingga 100) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Catatan {#notes}

- Menggunakan factory `createToolRoute` standar. Menerima satu berkas gambar melalui unggahan multipart.
- Mendukung format input HEIC, RAW, PSD, dan SVG (didekode secara otomatis).
- Urutan pemrosesan: padding ditambahkan terlebih dahulu, lalu bingkai membungkus di sekelilingnya, lalu radius sudut diterapkan, lalu bayangan digabungkan.
- Ketika `cornerRadius` atau `shadow` diaktifkan, keluaran dipaksa menjadi PNG (terlepas dari format input) untuk mempertahankan transparansi. Format yang mendukung alfa (PNG, WebP, AVIF) mempertahankan format aslinya.
- Bayangan sadar bentuk: bayangan mengikuti sudut membulat alih-alih membuat bayangan persegi panjang.
- Menetapkan `borderWidth` ke 0 dan hanya menggunakan `cornerRadius` + `shadow` menciptakan efek bayangan membulat tanpa bingkai.
