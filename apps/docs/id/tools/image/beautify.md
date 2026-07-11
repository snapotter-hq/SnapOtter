---
description: "Ubah tangkapan layar polos menjadi gambar yang dipoles dengan latar belakang gradien, bingkai perangkat, bayangan, dan ukuran media sosial."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: cffd8e39cb06
---

# Percantik Tangkapan Layar {#beautify-screenshot}

Tambahkan latar belakang gradien, bingkai perangkat, bayangan, watermark, dan ukuran media sosial ke tangkapan layar. Ideal untuk membuat gambar yang dipoles untuk pemasaran produk, media sosial, dan dokumentasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Tidak | `"linear-gradient"` | Jenis latar belakang: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Tidak | `"#667eea"` | Warna latar belakang solid (digunakan ketika `backgroundType` bernilai `solid`) |
| gradientStops | array | Tidak | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Titik henti warna gradien (min 2). Setiap titik henti memiliki `color` (hex) dan `position` (0-100). |
| gradientAngle | number | Tidak | 135 | Sudut gradien dalam derajat (0 hingga 360) |
| padding | number | Tidak | 64 | Padding di sekitar gambar dalam piksel (0 hingga 256) |
| borderRadius | number | Tidak | 12 | Radius sudut pada tangkapan layar (0 hingga 64) |
| shadowPreset | string | Tidak | `"subtle"` | Preset bayangan: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Tidak | 20 | Radius blur bayangan kustom (0 hingga 100, digunakan ketika `shadowPreset` bernilai `custom`) |
| shadowOffsetX | number | Tidak | 0 | Offset horizontal bayangan kustom (-50 hingga 50) |
| shadowOffsetY | number | Tidak | 10 | Offset vertikal bayangan kustom (-50 hingga 50) |
| shadowColor | string | Tidak | `"#000000"` | Warna bayangan kustom sebagai hex |
| shadowOpacity | number | Tidak | 30 | Opasitas bayangan kustom (0 hingga 100) |
| frame | string | Tidak | `"none"` | Bingkai perangkat atau jendela: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Tidak | - | Teks judul yang ditampilkan di bilah judul bingkai jendela |
| socialPreset | string | Tidak | `"none"` | Ubah ukuran ke dimensi media sosial: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Tidak | - | Overlay teks watermark opsional |
| watermarkPosition | string | Tidak | `"bottom-right"` | Posisi watermark: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Tidak | 50 | Opasitas watermark (0 hingga 100) |
| outputFormat | string | Tidak | `"png"` | Format keluaran: `png`, `jpeg`, `webp` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Dengan Gambar Latar Belakang {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Catatan {#notes}

- Menerima dua bidang berkas: `file` (wajib, tangkapan layar utama) dan `backgroundImage` (opsional, digunakan ketika `backgroundType` bernilai `image`).
- Mendukung format input HEIC, RAW, PSD, dan SVG (didekode secara otomatis).
- Preset bayangan dipetakan ke nilai spesifik:
  - `subtle`: blur 20, offsetY 4, opasitas 20%
  - `medium`: blur 40, offsetY 10, opasitas 35%
  - `dramatic`: blur 80, offsetY 20, opasitas 50%
- Preset media sosial mengubah ukuran keluaran akhir agar sesuai dengan dimensi target menggunakan mode `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Bingkai perangkat (`iphone`, `macbook`, `ipad`) menerapkan bezel perangkat keras di sekitar gambar dan melewati pengaturan `borderRadius`.
- Ketika transparansi diperlukan (bayangan, radius tepi, bingkai perangkat, atau latar belakang transparan), keluaran dipaksa menjadi PNG meskipun `jpeg` dipilih.
- Gambar latar belakang tidak didukung dalam mode pipeline/batch.
