---
description: "Ubah ukuran gambar berdasarkan piksel, persentase, atau dengan mode fit."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: c35e9fa1bead
---

# Ubah Ukuran Gambar {#resize}

Ubah ukuran gambar dengan menentukan dimensi piksel persis, faktor skala persentase, atau mode fit yang mengontrol bagaimana gambar menyesuaikan dengan dimensi target.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

Menerima multipart form data dengan berkas gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Lebar target dalam piksel (maks 16383) |
| height | integer | No | - | Tinggi target dalam piksel (maks 16383) |
| fit | string | No | `"contain"` | Bagaimana gambar disesuaikan dengan dimensi: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | Cegah pembesaran jika gambar lebih kecil dari target |
| percentage | number | No | - | Skalakan berdasarkan persentase (mis. 50 untuk setengah ukuran) |

Setidaknya salah satu dari `width`, `height`, atau `percentage` harus disediakan.

### Fit Modes {#fit-modes}

- **contain** - Ubah ukuran agar pas di dalam dimensi, mempertahankan rasio aspek (mungkin menyisakan ruang kosong)
- **cover** - Ubah ukuran agar menutupi dimensi, mempertahankan rasio aspek (mungkin memotong)
- **fill** - Regangkan agar persis sesuai dimensi (mengabaikan rasio aspek)
- **inside** - Seperti `contain`, tetapi hanya memperkecil, tidak pernah memperbesar
- **outside** - Seperti `cover`, tetapi hanya memperkecil, tidak pernah memperbesar

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Ubah ukuran berdasarkan persentase:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- Dimensi maksimum adalah 16383 piksel pada salah satu sumbu (batas Sharp/libvips).
- Format output mengikuti format input. Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
- Orientasi EXIF diterapkan otomatis sebelum pengubahan ukuran.
- Flag `withoutEnlargement` berguna untuk pemrosesan batch di mana beberapa gambar mungkin sudah lebih kecil dari target.
