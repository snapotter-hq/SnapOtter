---
description: "Gabungkan beberapa gambar menjadi kolase grid dengan 25+ template, jarak dan sudut yang dapat disesuaikan, serta pan dan zoom per sel."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: e7c79856f0ca
---

# Kolase & Grid {#collage-grid}

Gabungkan beberapa gambar menjadi kolase grid yang indah dengan 25+ template. Mendukung tata letak 2-9 gambar dengan kontrol jarak, radius sudut, warna latar belakang, dan pan/zoom per sel yang dapat disesuaikan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| templateId | string | Ya | - | ID tata letak template (mis. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Tidak | - | Array pengaturan per sel dengan `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Ya | - | Indeks gambar yang ditempatkan di sel ini (berbasis 0) |
| cells[].panX | number | Tidak | 0 | Offset pan horizontal (-100 hingga 100) |
| cells[].panY | number | Tidak | 0 | Offset pan vertikal (-100 hingga 100) |
| cells[].zoom | number | Tidak | 1 | Level zoom (1 hingga 10) |
| cells[].objectFit | string | Tidak | `"cover"` | Cara gambar mengisi sel: `cover` atau `contain` |
| gap | number | Tidak | 8 | Jarak antar sel dalam piksel (0 hingga 500) |
| cornerRadius | number | Tidak | 0 | Radius sudut untuk setiap sel dalam piksel (0 hingga 500) |
| backgroundColor | string | Tidak | `"#FFFFFF"` | Warna latar belakang sebagai hex atau `"transparent"` |
| aspectRatio | string | Tidak | `"free"` | Rasio aspek kanvas: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Tidak | `"png"` | Format output: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Tidak | 90 | Kualitas output (1 hingga 100) |

## Template yang Tersedia {#available-templates}

| ID Template | Gambar | Tata Letak |
|-------------|--------|--------|
| `2-h-equal` | 2 | Dua kolom sama besar |
| `2-v-equal` | 2 | Dua baris sama besar |
| `2-h-left-large` | 2 | Kiri 2/3, kanan 1/3 |
| `2-h-right-large` | 2 | Kiri 1/3, kanan 2/3 |
| `3-left-large` | 3 | Besar di kiri, dua bertumpuk di kanan |
| `3-right-large` | 3 | Dua bertumpuk di kiri, besar di kanan |
| `3-top-large` | 3 | Besar di atas, dua kolom di bawah |
| `3-h-equal` | 3 | Tiga kolom sama besar |
| `3-v-equal` | 3 | Tiga baris sama besar |
| `4-grid` | 4 | Grid 2x2 |
| `4-left-large` | 4 | Besar di kiri, tiga bertumpuk di kanan |
| `4-top-large` | 4 | Besar di atas, tiga kolom di bawah |
| `4-bottom-large` | 4 | Tiga kolom di atas, besar di bawah |
| `5-top2-bottom3` | 5 | Dua di atas, tiga di bawah |
| `5-top3-bottom2` | 5 | Tiga di atas, dua di bawah |
| `5-left-large` | 5 | Besar di kiri, empat bertumpuk di kanan |
| `5-center-large` | 5 | Besar di tengah, empat di sudut |
| `6-grid-2x3` | 6 | 2 kolom x 3 baris |
| `6-grid-3x2` | 6 | 3 kolom x 2 baris |
| `6-top-large` | 6 | Besar di atas, lima kolom di bawah |
| `7-mosaic` | 7 | Tata letak mosaik |
| `8-mosaic` | 8 | Tata letak mosaik |
| `9-grid` | 9 | Grid 3x3 |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Catatan {#notes}

- Unggah beberapa file gambar dalam permintaan multipart. Gambar ditempatkan ke sel template sesuai urutan unggahan.
- Jika jumlah gambar yang diunggah lebih banyak dari yang didukung template, gambar tambahan diabaikan.
- Mendukung format input HEIC, RAW, PSD, dan SVG (didekode otomatis).
- Ukuran dasar kanvas adalah 2400px pada sisi terpanjang, diskalakan sesuai rasio aspek yang dipilih.
- Ketika `aspectRatio` adalah `"free"`, kanvas secara default menggunakan 4:3 (2400x1800).
- Nilai `panX`/`panY` per sel menggeser jendela crop di dalam sel. Nilai 100 menggeser sepenuhnya ke satu tepi, -100 ke tepi lainnya.
- Warna latar belakang `"transparent"` hanya dipertahankan dengan format output `png`, `webp`, atau `avif`.
