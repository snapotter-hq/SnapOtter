---
description: "Menambahkan watermark teks dengan posisi, opasitas, rotasi, dan pengubinan yang dapat dikonfigurasi."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 7baab029b033
---

# Text Watermark {#text-watermark}

Menambahkan overlay watermark teks ke gambar. Mendukung penempatan tunggal di sudut/tengah atau pengulangan berubin di seluruh gambar, dengan ukuran font, warna, opasitas, dan rotasi yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Menerima data formulir multipart dengan sebuah file gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Teks watermark (1 hingga 500 karakter) |
| fontSize | number | No | `48` | Ukuran font dalam piksel (8 hingga 1000) |
| color | string | No | `"#000000"` | Warna teks dalam format hex (`#RRGGBB`) |
| opacity | number | No | `50` | Persentase opasitas teks (0 hingga 100) |
| position | string | No | `"center"` | Penempatan: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | Sudut rotasi teks dalam derajat (-360 hingga 360) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Watermark berubin di seluruh gambar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- Watermark di-render sebagai teks SVG dan dikomposit ke gambar, mempertahankan kualitas keluaran.
- Mode berubin memberi jarak elemen teks berdasarkan ukuran font (jarak 6x horizontal, 4x vertikal), dibatasi maksimum 500 elemen.
- Untuk posisi sudut, padding dari tepi sama dengan ukuran font.
- Font yang digunakan adalah font sans-serif default sistem.
- Karakter khusus XML dalam teks (`&`, `<`, `>`, `"`, `'`) di-escape dengan aman.
- Format keluaran mengikuti format masukan. Masukan HEIC, RAW, PSD, dan SVG otomatis didekode sebelum diproses.
