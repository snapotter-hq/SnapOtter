---
description: "Tambahkan padding pada gambar ke rasio aspek target dengan latar belakang warna solid, transparan, atau buram."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 79d2efad26d9
---

# Image Pad {#image-pad}

Tambahkan padding pada gambar ke rasio aspek target dengan menambahkan latar belakang warna solid, transparan, atau buram di sekitarnya. Berguna untuk menyesuaikan gambar ke rasio aspek tetap untuk media sosial atau cetak tanpa pemotongan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Menerima multipart form data dengan file gambar dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"1:1"` | Rasio aspek target: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, atau `custom` |
| ratioW | integer | No | `1` | Lebar rasio kustom (1-100, digunakan saat target adalah `custom`) |
| ratioH | integer | No | `1` | Tinggi rasio kustom (1-100, digunakan saat target adalah `custom`) |
| background | string | No | `"color"` | Mode latar belakang: `color`, `transparent`, atau `blur` |
| color | string | No | `"#ffffff"` | Warna hex latar belakang (saat background adalah `color`) |
| padding | integer | No | `0` | Padding tambahan sebagai persentase kanvas (0-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notes {#notes}

- Mode latar belakang `blur` membuat salinan buram dari gambar asli sebagai pengisi padding, menghasilkan hasil yang kohesif secara visual.
- Saat menggunakan latar belakang `transparent`, output dikonversi ke PNG untuk mempertahankan alpha.
- Format output mengikuti format input kecuali bila transparansi terlibat. Input HEIC, RAW, PSD, dan SVG di-decode otomatis sebelum pemrosesan.
- Atur `target` ke `custom` dan sediakan `ratioW` serta `ratioH` untuk rasio aspek sembarang (mis., `ratioW: 3, ratioH: 2` untuk 3:2).
