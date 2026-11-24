---
description: "Pengubahan ukuran seam-carving yang menambah atau menghapus piksel di sepanjang jalur berkepentingan rendah untuk mempertahankan konten kunci dan wajah."
i18n_source_hash: a4adf011b2bd
i18n_provenance: human
i18n_output_hash: d5878215219f
---

# Pengubahan Ukuran Sadar-Konten {#content-aware-resize}

Pengubahan ukuran seam carving yang secara cerdas menghapus atau menambahkan piksel di sepanjang jalur dengan kepentingan visual paling rendah, mempertahankan konten penting dan secara opsional melindungi wajah.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Pemrosesan:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** Tidak diperlukan untuk operasi dasar. Perlindungan wajah menggunakan bundle `face-detection` (200-300 MB) jika diaktifkan.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | File gambar (multipart) |
| width | number | Tidak | - | Lebar target dalam piksel |
| height | number | Tidak | - | Tinggi target dalam piksel |
| protectFaces | boolean | Tidak | `false` | Deteksi dan lindungi wajah dari penghapusan seam |
| blurRadius | number | Tidak | `4` | Radius blur pra-pemrosesan untuk perhitungan energi (0-20) |
| sobelThreshold | number | Tidak | `2` | Ambang batas deteksi tepi Sobel (1-20). Nilai lebih tinggi membuat algoritma lebih agresif |
| square | boolean | Tidak | `false` | Ubah ukuran menjadi persegi (menggunakan dimensi yang lebih kecil) |

Setidaknya salah satu dari `width`, `height`, atau `square` harus ditentukan.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Respons {#response}

### Respons Awal (202 Accepted) {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Hasil Akhir (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## Catatan {#notes}

- Menggunakan pustaka seam carving `caire` untuk pengubahan ukuran sadar-konten.
- Mengecilkan dengan menghapus seam atau memperbesar dengan menyisipkannya. Setiap sisi dapat bertambah paling banyak hingga 2x ukuran aslinya.
- Opsi `protectFaces` menggunakan deteksi wajah AI untuk menandai area wajah sebagai berenergi tinggi, mencegah seam melewati wajah.
- `blurRadius` mengontrol penghalusan sebelum perhitungan peta energi. Nilai lebih tinggi membuat peta energi lebih seragam, yang dapat membantu pada gambar berderau.
- `sobelThreshold` memengaruhi seberapa agresif tepi dideteksi. Nilai lebih rendah mempertahankan lebih banyak tepi halus.
- Output selalu berformat PNG.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui dekode otomatis.
