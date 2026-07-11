---
description: "Mengonversi file SVG ke PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, atau JXL pada resolusi dan DPI kustom, dengan dukungan batch."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: d468d971804b
---

# SVG to Raster {#svg-to-raster}

Mengonversi file SVG ke format gambar raster (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, atau JXL) pada resolusi dan DPI kustom. Juga mendukung konversi batch dari beberapa SVG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Lebar target dalam piksel (1 hingga 65536). Mempertahankan rasio aspek jika hanya satu dimensi yang diatur. |
| height | integer | No | - | Tinggi target dalam piksel (1 hingga 65536). Mempertahankan rasio aspek jika hanya satu dimensi yang diatur. |
| dpi | integer | No | 300 | DPI render, mengontrol kepadatan rasterisasi dasar (36 hingga 2400) |
| quality | number | No | 90 | Kualitas keluaran untuk format lossy (1 hingga 100) |
| backgroundColor | string | No | `"#00000000"` | Warna latar belakang sebagai hex (6 atau 8 karakter, 8 karakter menyertakan alfa) |
| outputFormat | string | No | `"png"` | Format keluaran: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Mengonversi beberapa file SVG dalam satu permintaan. Mengembalikan arsip ZIP.

### Additional Batch Parameters {#additional-batch-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | ID job opsional yang disediakan klien untuk pelacakan progres (maks 128 karakter) |

### Batch Example Request {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response {#batch-response}

Endpoint batch mengalirkan file ZIP secara langsung dengan header:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes {#notes}

- Hanya menerima file SVG dan SVGZ (memvalidasi konten, bukan hanya ekstensi). SVGZ otomatis didekompresi.
- Konten SVG disanitasi sebelum di-render untuk mencegah XSS dan pemuatan sumber daya eksternal.
- Pengaturan `dpi` mengontrol kepadatan saat SVG dirasterisasi. DPI yang lebih tinggi menghasilkan dimensi piksel yang lebih besar dari viewport SVG yang sama.
- Ketika `width` dan `height` keduanya diberikan, gambar diubah ukurannya menggunakan `fit: inside` (mempertahankan rasio aspek dalam batas yang ada).
- Sebuah `previewUrl` disertakan dalam respons untuk format yang tidak dapat ditampilkan browser secara native (TIFF, HEIF). Pratinjaunya adalah thumbnail WebP 1200px.
- Latar belakang default `#00000000` sepenuhnya transparan. Atur ke `#FFFFFF` untuk latar belakang putih (berguna dengan keluaran JPEG yang tidak mendukung transparansi).
- Pemrosesan batch mematuhi konfigurasi server `MAX_BATCH_SIZE` dan menggunakan worker konkuren untuk performa.
- Progres untuk operasi batch dapat dilacak melalui SSE di `/api/v1/jobs/:jobId/progress`.
