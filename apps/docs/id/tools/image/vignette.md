---
description: "Menambahkan efek vignette dengan kekuatan, warna, dan posisi yang dapat disesuaikan."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 10bb9025771f
---

# Vignette {#vignette}

Menambahkan efek vignette yang menggelapkan atau mewarnai tepi gambar. Mendukung kekuatan, warna, radius, kelembutan, kebulatan, dan posisi tengah yang dapat disesuaikan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Menerima data formulir multipart dengan sebuah file gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | Opasitas vignette (0.1-1) |
| color | string | No | `"#000000"` | Warna hex vignette |
| radius | integer | No | `70` | Radius luar sebagai persentase dari setengah diagonal (0-100) |
| softness | integer | No | `50` | Kelembutan feather (0-100); nilai lebih tinggi menghasilkan pudar yang lebih bertahap |
| roundness | integer | No | `100` | Bentuk: 100 = lingkaran, 0 = elips yang sesuai rasio aspek gambar |
| centerX | integer | No | `50` | Posisi tengah horizontal sebagai persentase (0-100) |
| centerY | integer | No | `50` | Posisi tengah vertikal sebagai persentase (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes {#notes}

- `radius` yang lebih kecil menggelapkan lebih banyak bagian gambar; radius yang lebih besar membatasi vignette ke tepi paling ekstrem.
- Gunakan `color` non-hitam (mis., putih atau nada sepia) untuk efek vignette kreatif.
- Menyesuaikan `centerX` dan `centerY` memungkinkan Anda memposisikan area bersih di luar pusat, berguna untuk mengarahkan fokus ke subjek yang tidak berada di tengah bingkai.
- Format keluaran mengikuti format masukan. Masukan HEIC, RAW, PSD, dan SVG otomatis didekode sebelum diproses.
