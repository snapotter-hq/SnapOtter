---
description: "Membagi satu gambar menjadi petak-petak grid berdasarkan baris dan kolom atau berdasarkan ukuran piksel, dikembalikan sebagai arsip ZIP."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 8fcbdb41456e
---

# Bagi Gambar {#image-splitting}

Membagi satu gambar menjadi petak-petak grid berdasarkan jumlah kolom/baris atau berdasarkan dimensi piksel tertentu. Mengembalikan arsip ZIP yang berisi semua petak.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | Jumlah kolom untuk membagi (1 hingga 100) |
| rows | integer | No | 3 | Jumlah baris untuk membagi (1 hingga 100) |
| tileWidth | integer | No | - | Lebar petak dalam piksel (min 10). Menggantikan `columns` ketika `tileWidth` dan `tileHeight` keduanya diatur. |
| tileHeight | integer | No | - | Tinggi petak dalam piksel (min 10). Menggantikan `rows` ketika `tileWidth` dan `tileHeight` keduanya diatur. |
| outputFormat | string | No | `"original"` | Format keluaran untuk petak: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Kualitas keluaran untuk format lossy (1 hingga 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response {#example-response}

Responsnya dialirkan langsung sebagai file ZIP dengan `Content-Type: application/zip`. Nama file mengikuti pola `split-<jobId>.zip`.

Setiap petak di dalam ZIP diberi nama `<originalBaseName>_r<row>_c<col>.<ext>` (mis. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notes {#notes}

- Menerima satu file gambar.
- Mendukung format masukan HEIC, RAW, PSD, dan SVG (otomatis didekode).
- Ketika `tileWidth` dan `tileHeight` keduanya diberikan, keduanya diprioritaskan di atas `columns`/`rows`. Dimensi grid dihitung sebagai `ceil(imageWidth / tileWidth)` dan `ceil(imageHeight / tileHeight)`.
- Petak tepi (kolom paling kanan, baris bawah) mungkin lebih kecil dari ukuran petak yang ditentukan jika dimensi gambar tidak habis dibagi rata.
- Ukuran grid maksimum dibatasi hingga 100x100 (10.000 petak).
- Responsnya mengalirkan ZIP secara langsung, sehingga tidak ada body respons JSON. Gunakan `--output` dengan curl untuk menyimpan file.
