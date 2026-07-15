---
description: "Menggabungkan gambar berdampingan, ditumpuk, atau dalam grid dengan kontrol atas perataan, celah, tepi, dan mode pengubahan ukuran."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 22d6b7c3538e
---

# Gabungkan Gambar {#stitch-combine}

Menggabungkan beberapa gambar berdampingan, ditumpuk secara vertikal, atau disusun dalam grid. Mendukung perataan, celah, tepi, radius sudut, dan beberapa mode pengubahan ukuran.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | Arah tata letak: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | Jumlah kolom ketika direction adalah `grid` (2 hingga 100) |
| resizeMode | string | No | `"fit"` | Cara gambar diubah ukurannya: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | Perataan sumbu-silang: `start`, `center`, `end` |
| gap | number | No | 0 | Celah antar gambar dalam piksel (0 hingga 1000) |
| border | number | No | 0 | Lebar tepi luar dalam piksel (0 hingga 500) |
| cornerRadius | number | No | 0 | Radius sudut yang diterapkan pada keluaran akhir (0 hingga 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Warna latar belakang/tepi sebagai hex (mis. `#FF0000`) |
| format | string | No | `"png"` | Format keluaran: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Kualitas keluaran (1 hingga 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes {#notes}

- Memerlukan setidaknya 2 gambar. Unggah beberapa file gambar dalam permintaan multipart.
- Mendukung format masukan HEIC, RAW, PSD, dan SVG (otomatis didekode).
- Mode pengubahan ukuran:
  - `fit` - Menskalakan gambar agar sesuai dengan dimensi terkecil di sepanjang sumbu penggabungan.
  - `original` - Mempertahankan ukuran asli (dapat menghasilkan tepi yang tidak rata).
  - `stretch` - Memaksa gambar agar sesuai dengan dimensi terkecil tanpa mempertahankan rasio aspek.
  - `crop` - Memangkas-menutupi gambar agar sesuai dengan dimensi terkecil.
- Dalam mode `grid`, sel diukur sesuai dimensi median dari semua gambar.
- `cornerRadius` diterapkan ke seluruh keluaran akhir, bukan gambar individual.
- Ukuran kanvas dibatasi oleh konfigurasi server `MAX_CANVAS_PIXELS` untuk mencegah kehabisan memori.
