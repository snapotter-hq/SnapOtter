---
description: "Menambahkan overlay teks bergaya dengan bayangan jatuh dan kotak latar belakang."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 3aca1be1081d
---

# Text Overlay {#text-overlay}

Menambahkan teks bergaya ke gambar dengan bayangan jatuh opsional dan kotak latar belakang semi-transparan. Cocok untuk judul, keterangan, atau anotasi pada foto.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Menerima data formulir multipart dengan sebuah file gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Teks yang di-overlay (1 hingga 500 karakter) |
| fontSize | number | No | `48` | Ukuran font dalam piksel (8 hingga 200) |
| color | string | No | `"#FFFFFF"` | Warna teks dalam format hex (`#RRGGBB`) |
| position | string | No | `"bottom"` | Penempatan vertikal: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | Menampilkan persegi panjang latar belakang semi-transparan di belakang teks |
| backgroundColor | string | No | `"#000000"` | Warna kotak latar belakang dalam format hex (`#RRGGBB`) |
| shadow | boolean | No | `true` | Menerapkan bayangan jatuh di belakang teks |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Dengan kotak latar belakang:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Teks selalu diletakkan di tengah secara horizontal di dalam gambar.
- Bayangan jatuh menggunakan offset 2px dengan blur 3px pada opasitas hitam 70%.
- Kotak latar belakang membentang selebar penuh gambar pada opasitas 70%, dengan tinggi proporsional terhadap ukuran font (1.8x).
- Teks di-render melalui komposit SVG, sehingga font sans-serif default sistem yang digunakan.
- Karakter khusus XML dalam teks di-escape dengan aman.
- Format keluaran mengikuti format masukan. Masukan HEIC, RAW, PSD, dan SVG otomatis didekode sebelum diproses.
