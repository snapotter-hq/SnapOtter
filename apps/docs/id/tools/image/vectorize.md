---
description: "Mengonversi gambar raster ke SVG dengan vektorisasi hitam-putih (potrace) dan multi-layer penuh warna."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: e0fdb2fea14e
---

# Image to SVG {#image-to-svg}

Memvektorisasi gambar raster menjadi SVG menggunakan algoritma penelusuran. Mendukung penelusuran hitam-putih (potrace) dan vektorisasi multi-layer penuh warna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | Mode penelusuran: `bw` (hitam dan putih) atau `color` (layer multi-warna) |
| threshold | number | No | 128 | Ambang kecerahan untuk mode B&W (0 hingga 255). Piksel di bawahnya menjadi hitam. |
| colorPrecision | number | No | 6 | Presisi kuantisasi warna untuk mode warna (1 hingga 16). Nilai lebih tinggi menghasilkan lebih banyak layer warna yang berbeda. |
| layerDifference | number | No | 6 | Perbedaan warna minimum antar layer dalam mode warna (1 hingga 128) |
| filterSpeckle | number | No | 4 | Area minimum untuk bentuk yang ditelusuri dalam piksel (1 hingga 256). Menghapus noise/bintik. |
| pathMode | string | No | `"spline"` | Penghalusan jalur: `none` (bergerigi), `polygon` (segmen lurus), `spline` (kurva halus) |
| cornerThreshold | number | No | 60 | Ambang sudut untuk deteksi sudut dalam mode warna (0 hingga 180 derajat) |
| invert | boolean | No | `false` | Membalik gambar sebelum penelusuran (menukar hitam/putih) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes {#notes}

- Keluaran selalu berupa file SVG terlepas dari format masukan.
- Mendukung format masukan HEIC, RAW, PSD, dan SVG (otomatis didekode ke raster sebelum penelusuran).
- Mode B&W menggunakan algoritma potrace. Gambar dikonversi ke grayscale terlebih dahulu, lalu diberi ambang menjadi hitam/putih murni sebelum penelusuran.
- Mode warna menggunakan pendekatan multi-layer: gambar dikuantisasi menjadi layer warna, masing-masing ditelusuri secara terpisah dan ditumpuk dalam keluaran SVG.
- Nilai `filterSpeckle` yang lebih rendah mempertahankan lebih banyak detail tetapi menghasilkan file SVG yang lebih besar dengan lebih banyak jalur.
- Pengaturan `pathMode` secara signifikan memengaruhi ukuran file: `none` menghasilkan jalur terbanyak, `spline` menghasilkan keluaran paling halus (dan biasanya paling kecil).
- Untuk hasil terbaik dengan logo dan ikon, gunakan mode B&W dengan masukan kontras-tinggi yang bersih. Untuk foto atau ilustrasi, gunakan mode warna dengan `colorPrecision` yang lebih tinggi.
