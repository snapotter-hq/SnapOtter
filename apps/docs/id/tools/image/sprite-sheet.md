---
description: "Menggabungkan beberapa gambar menjadi satu grid sprite sheet dengan metadata frame."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: f84631451fea
---

# Sprite Sheet {#sprite-sheet}

Menggabungkan beberapa gambar menjadi satu grid sprite sheet. Setiap gambar diubah ukurannya agar sesuai dengan dimensi gambar pertama dan ditempatkan ke dalam grid. Mengembalikan gambar sprite sheet beserta metadata koordinat per frame.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Menerima data formulir multipart dengan dua atau lebih file gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | Jumlah kolom dalam grid (1-16) |
| padding | integer | No | `0` | Padding antar sel dalam piksel (0-64) |
| background | string | No | `"#ffffff"` | Warna latar belakang hex |
| format | string | No | `"png"` | Format keluaran: `png`, `webp`, atau `jpeg` |
| quality | integer | No | `90` | Kualitas keluaran (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes {#notes}

- Menerima 2 hingga 64 gambar. Semua gambar diubah ukurannya agar sesuai dengan dimensi gambar pertama yang diunggah.
- Array `frames` memberikan koordinat piksel yang tepat dari setiap frame dalam keluaran, cocok untuk definisi sprite CSS atau peta frame game engine.
- Jumlah baris dihitung secara otomatis dari jumlah gambar dan nilai `columns`.
- Gunakan parameter `padding` untuk menambahkan jarak antar sel. Warna `background` terlihat di area padding dan sel-sel kosong yang tersisa di bagian akhir.
- Masukan HEIC, RAW, PSD, dan SVG otomatis didekode sebelum diproses.
