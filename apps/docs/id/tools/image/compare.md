---
description: "Bandingkan dua gambar berdampingan dengan visualisasi diff tingkat piksel dan skor kemiripan."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 8f37f0388351
---

# Bandingkan Gambar {#image-compare}

Unggah dua gambar untuk menghitung peta perbedaan tingkat piksel dan persentase kemiripan numerik. Outputnya adalah gambar diff yang menyoroti area yang berubah dengan warna merah.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compare`

Menerima data formulir multipart dengan **dua** file gambar. Tidak diperlukan field pengaturan.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah tepat dua file gambar.

| Field | Tipe | Wajib | Deskripsi |
|-------|------|----------|-------------|
| file (pertama) | file | Ya | Gambar pertama |
| file (kedua) | file | Ya | Gambar kedua |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Field Respons {#response-fields}

| Field | Tipe | Deskripsi |
|-------|------|-------------|
| jobId | string | Pengenal pekerjaan untuk mengunduh gambar diff |
| similarity | number | Persentase kemiripan antara kedua gambar (0 hingga 100) |
| dimensions | object | Lebar dan tinggi yang digunakan untuk perbandingan |
| downloadUrl | string | URL untuk mengunduh gambar diff yang dihasilkan |
| originalSize | number | Gabungan ukuran kedua gambar input dalam byte |
| processedSize | number | Ukuran gambar diff output dalam byte |

## Catatan {#notes}

- Kedua gambar diubah ukurannya menjadi dimensi yang sama (maksimum dari masing-masing sumbu) sebelum dibandingkan.
- Gambar diff menyoroti perbedaan dengan warna merah dengan opasitas sebanding dengan besarnya perubahan. Piksel yang identik atau hampir identik (perbedaan < 10) ditampilkan sebagai versi semi-transparan dari gambar asli.
- Kemiripan dihitung sebagai kebalikan dari rata-rata perbedaan piksel di seluruh piksel, dinyatakan sebagai persentase.
- Kemiripan 100% berarti gambar-gambar tersebut identik secara piksel (pada resolusi perbandingan).
- Output diff selalu berformat PNG terlepas dari format input.
- Kedua gambar divalidasi dan didekode (HEIC, RAW, PSD, SVG didukung) sebelum dibandingkan.
- Orientasi EXIF diterapkan otomatis pada kedua gambar sebelum diproses.
