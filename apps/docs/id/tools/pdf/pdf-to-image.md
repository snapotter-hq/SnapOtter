---
description: "Konversi halaman PDF menjadi gambar berkualitas tinggi."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: ba37578b7109
---

# PDF to Image {#pdf-to-image}

Konversi halaman PDF menjadi gambar raster berkualitas tinggi. Mendukung pemilihan halaman, beberapa format output, kontrol DPI, dan mode warna. Termasuk sub-rute info dan preview untuk memeriksa PDF sebelum konversi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | Format output: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | Resolusi render (36 sampai 2400). DPI yang lebih tinggi menghasilkan gambar yang lebih besar dan lebih detail. |
| quality | number | No | 85 | Kualitas output untuk format lossy (1 sampai 100) |
| colorMode | string | No | `"color"` | Mode warna: `color`, `grayscale`, `bw` (ambang hitam dan putih) |
| pages | string | No | `"all"` | Pemilihan halaman: `all`, satu halaman (`3`), rentang (`1-5`), atau dipisahkan koma (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Mengembalikan jumlah halaman PDF tanpa merender halaman apa pun.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Mengembalikan thumbnail JPEG resolusi rendah dari semua halaman sebagai URL data base64. Berguna untuk membangun UI pemilihan halaman.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Menggunakan MuPDF untuk merender PDF, memberikan output berkualitas tinggi dengan rendering font dan grafik vektor yang benar.
- PDF yang dilindungi kata sandi tidak didukung dan akan mengembalikan error 400.
- Parameter `pages` mendukung sintaks yang fleksibel:
  - `"all"` atau `""` - semua halaman
  - `"3"` - satu halaman
  - `"1-5"` - rentang halaman (inklusif)
  - `"1,3,5-8"` - campuran halaman individual dan rentang
- Nomor halaman berbasis 1. Menentukan halaman melebihi panjang dokumen akan mengembalikan error 400.
- Endpoint utama selalu menghasilkan unduhan halaman individual sekaligus ZIP yang berisi semua halaman yang dipilih.
- Endpoint preview merender pada 72 DPI dan menskalakan ke lebar 300px untuk pembuatan thumbnail yang cepat. Thumbnail berupa JPEG dengan kualitas 60%.
- Endpoint preview menghormati konfigurasi server `MAX_PDF_PAGES`, membatasi berapa banyak thumbnail yang dihasilkan.
- Untuk dokumen besar pada DPI tinggi, waktu pemrosesan meningkat secara proporsional. Pertimbangkan menggunakan DPI lebih rendah (150) untuk penggunaan web dan DPI lebih tinggi (300-600) untuk cetak.
