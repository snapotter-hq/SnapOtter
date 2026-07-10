---
description: "Hasilkan semua ukuran favicon dan ikon aplikasi standar dari gambar sumber."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 8d0c0e40c85d
---

# Favicon Generator {#favicon-generator}

Hasilkan satu set lengkap file favicon dan ikon aplikasi dari gambar sumber. Menghasilkan semua ukuran standar yang dibutuhkan untuk browser, perangkat Apple, dan Android, beserta web manifest dan cuplikan HTML.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Menerima multipart form data dengan satu atau lebih file gambar dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| background | string | No | - | Warna hex latar belakang (mis. `"#ffffff"`). Bila diatur, ikon akan diratakan ke warna ini. |
| padding | integer | No | `0` | Persentase padding di sekitar konten ikon (0 hingga 40) |
| radius | integer | No | `0` | Persentase radius sudut untuk ikon dengan sudut membulat (0 hingga 50) |
| sizes | integer[] | No | - | Batasi output ke ukuran piksel tertentu (mis. `[16, 32, 180]`). Kosongkan untuk menghasilkan semua ukuran standar. |
| themeColor | string | No | `"#ffffff"` | Warna hex tema untuk web manifest |

## Generated Files {#generated-files}

Untuk setiap gambar input, file-file berikut dihasilkan:

| File | Size | Purpose |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Ikon tab browser |
| `favicon-32x32.png` | 32x32 | Ikon tab browser (HiDPI) |
| `favicon-48x48.png` | 48x48 | Pintasan desktop |
| `apple-touch-icon.png` | 180x180 | Layar utama iOS |
| `android-chrome-192x192.png` | 192x192 | Layar utama Android |
| `android-chrome-512x512.png` | 512x512 | Splash screen Android |
| `favicon.ico` | 32x32 | Format ICO lawas |
| `manifest.json` | - | Web app manifest dengan referensi ikon |
| `favicon-snippet.html` | - | Tag link HTML siap pakai |

## Example Request {#example-request}

Gambar sumber tunggal dengan sudut membulat dan padding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Beberapa gambar sumber (masing-masing mendapat setnya sendiri di subfolder):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Example Response {#example-response}

Responsnya adalah file ZIP yang di-stream langsung. Header respons adalah:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## HTML Snippet Included {#html-snippet-included}

ZIP menyertakan sebuah file `favicon-snippet.html` yang bisa Anda tempelkan ke `<head>` HTML Anda:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notes {#notes}

- Gambar sumber diubah ukurannya menggunakan mode fit `cover`, artinya gambar dipotong untuk mengisi setiap ukuran persegi. Untuk hasil terbaik, gunakan gambar sumber berbentuk persegi.
- Bila beberapa file diunggah, masing-masing mendapat subfoldernya sendiri di ZIP (dinamai sesuai file sumber).
- Untuk unggahan satu file, semua output berada di root ZIP tanpa subfolder.
- File yang gagal validasi atau decoding akan dilewati, dan sebuah `skipped-files.txt` disertakan di ZIP untuk menjelaskan masalahnya.
- Format input yang didukung: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD, dan lainnya.
- Orientasi EXIF diterapkan otomatis sebelum pengubahan ukuran.
