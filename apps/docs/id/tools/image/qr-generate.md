---
description: "Buat kode QR dengan warna kustom dan tingkat koreksi kesalahan."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: f2de527b0127
---

# QR Code Generator {#qr-code-generator}

Buat gambar kode QR dari teks atau URL dengan ukuran, tingkat koreksi kesalahan, dan warna latar depan/latar belakang kustom yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Menerima **JSON body** (bukan multipart). Tidak perlu unggah berkas.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Konten yang di-encode dalam kode QR (1 hingga 2000 karakter) |
| size | number | No | `400` | Lebar/tinggi gambar output dalam piksel (100 hingga 10000) |
| errorCorrection | string | No | `"M"` | Tingkat koreksi kesalahan: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | Warna latar depan/modul kode QR dalam hex (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | Warna latar belakang kode QR dalam hex (`#RRGGBB`) |
| logoDataUri | string | No | - | Gambar logo sebagai data URI (`data:image/png;base64,...` atau `data:image/jpeg;base64,...`, maks 700 KB). Diposisikan di tengah kode QR pada 22% dari ukuran QR. Memaksa koreksi kesalahan ke `H` |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | Kepadatan data maksimum |
| `M` | ~15% | Seimbang (default) |
| `Q` | ~25% | Baik untuk kode cetak |
| `H` | ~30% | Terbaik untuk kode dengan overlay logo |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Kode QR bermerek dengan warna kustom:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- Endpoint ini menerima JSON, bukan multipart form data, karena tidak perlu unggah gambar.
- Output selalu berupa gambar PNG.
- Nama berkas output selalu `qrcode.png`.
- `originalSize` selalu 0 karena alat ini menghasilkan gambar dari awal.
- Zona sunyi 2 modul (margin) disertakan di sekitar kode QR.
- Panjang teks maksimum adalah 2000 karakter. Kapasitas sebenarnya bergantung pada tingkat koreksi kesalahan dan enkode karakter.
- Tingkat koreksi kesalahan yang lebih tinggi memungkinkan kode QR tetap dapat dipindai meskipun sebagian tertutup, tetapi mengurangi kapasitas data.
- Saat `logoDataUri` disediakan, koreksi kesalahan secara otomatis dipaksa ke `H` (30%) agar kode QR tetap dapat dipindai meskipun logo menutupi bagian tengah.
